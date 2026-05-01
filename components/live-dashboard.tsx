'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { DRIVER_DATA } from '@/lib/data';
import { Flag, Timer, ChevronRight, Activity, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';

// Types for our internal state
interface LiveDriverData {
  driverNumber: number;
  position: number;
  gapToLeader: string;
  interval: string;
  lastLapTime: string;
  bestLapTime: string;
  sectors: number[]; // 0 = none, 1 = yellow, 2 = green, 3 = purple
  hasFastestLap: boolean;
  drsActive: boolean;
  isPit: boolean;
  status: string;
}

// Initialize all drivers with empty state so live updates can populate them
const INITIAL_LIVE_DATA: LiveDriverData[] = DRIVER_DATA.map((d, index) => ({
  driverNumber: d.driver_season.driver_number,
  position: index + 1, // temporary order
  gapToLeader: '',
  interval: '',
  lastLapTime: '',
  bestLapTime: '',
  sectors: [0, 0, 0],
  hasFastestLap: false,
  drsActive: false,
  isPit: false,
  status: ''
}));

export default function LiveDashboard() {
  const [liveData, setLiveData] = useState<LiveDriverData[]>(INITIAL_LIVE_DATA);
  const [sessionStatus, setSessionStatus] = useState('Waiting...');
  const [sessionName, setSessionName] = useState('Grand Prix');
  const [sessionType, setSessionType] = useState('');
  const [sessionLap, setSessionLap] = useState('0');
  const [wsConnected, setWsConnected] = useState(false);
  const [rcMsgs, setRcMsgs] = useState<{id: string, text: string}[]>([]);
  const processedMsgIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let ws: WebSocket | null = null;
    let fallbackTimer: NodeJS.Timeout;

    const connect = () => {
      try {
        ws = new WebSocket('wss://f1dash.net/ws');
        
        ws.onopen = () => {
          console.log('[LiveDashboard] WebSocket Connected');
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Handle Session Info for status
            if (data.SessionInfo) {
              if (data.SessionInfo.SessionStatus) {
                setSessionStatus(data.SessionInfo.SessionStatus);
              }
              if (data.SessionInfo.Meeting && data.SessionInfo.Meeting.Name) {
                setSessionName(data.SessionInfo.Meeting.Name);
              }
              if (data.SessionInfo.Name) {
                setSessionType(data.SessionInfo.Name);
              }
            }
            
            // Handle Race Control Messages
            if (data.RaceControlMessages && data.RaceControlMessages.Messages) {
               const newMsgs: {id: string, text: string}[] = [];
               Object.entries(data.RaceControlMessages.Messages).forEach(([key, msg]: [string, any]) => {
                  if (!processedMsgIds.current.has(key)) {
                     processedMsgIds.current.add(key);
                     if (msg.Message) {
                        newMsgs.push({ id: key, text: msg.Message });
                     }
                  }
               });
               if (newMsgs.length > 0) {
                  setRcMsgs(prev => [...prev, ...newMsgs].slice(-5)); // keep up to 5 on screen
                  newMsgs.forEach(m => {
                     setTimeout(() => {
                        setRcMsgs(prev => prev.filter(p => p.id !== m.id));
                     }, 10000);
                  });
               }
            }
            
            // Handle TrackStatus
            if (data.TrackStatus) {
                if (data.TrackStatus.Message) {
                   // e.g. "AllClear", "Yellow", "Red"
                   if (data.TrackStatus.Message !== 'AllClear') {
                       setSessionStatus(data.TrackStatus.Message);
                   }
                }
            }

            // Handle SessionData for current Lap
            if (data.SessionData && data.SessionData.Series && Array.isArray(data.SessionData.Series)) {
              if (data.SessionData.Series.length > 0) {
                 const latest = data.SessionData.Series[data.SessionData.Series.length - 1];
                 if (latest.Lap) {
                   setSessionLap(latest.Lap.toString());
                 }
              }
            }

            // Handle actual Live TimingData
            if (data.TimingData && data.TimingData.Lines) {
               setLiveData(prev => {
                  const next = [...prev];
                  let fastestLapChanged = false;
                  
                  Object.entries(data.TimingData.Lines).forEach(([driverNum, lineData]: [string, any]) => {
                     const idx = next.findIndex(d => d.driverNumber.toString() === driverNum);
                     if (idx !== -1) {
                        const item = { ...next[idx] };
                        
                        if (lineData.Position !== undefined) item.position = parseInt(lineData.Position, 10);
                        if (lineData.GapToLeader !== undefined) {
                            item.gapToLeader = lineData.GapToLeader || 'LEADER';
                        }
                        if (lineData.IntervalToPositionAhead && lineData.IntervalToPositionAhead.Value !== undefined) {
                            item.interval = lineData.IntervalToPositionAhead.Value;
                        }
                        if (lineData.LastLapTime && lineData.LastLapTime.Value !== undefined) {
                            item.lastLapTime = lineData.LastLapTime.Value;
                        }
                        if (lineData.BestLapTime && lineData.BestLapTime.Value !== undefined) {
                            item.bestLapTime = lineData.BestLapTime.Value;
                        }
                        
                        // Parse Sectors
                        if (lineData.Sectors) {
                           item.sectors = [...item.sectors];
                           Object.entries(lineData.Sectors).forEach(([secIdx, sec]: [string, any]) => {
                               const si = parseInt(secIdx, 10);
                               if (si >= 0 && si <= 2) {
                                  if (sec.OverallFastest) item.sectors[si] = 3;
                                  else if (sec.PersonalFastest) item.sectors[si] = 2;
                                  else if (sec.Value) item.sectors[si] = 1;
                                  
                                  // Sometimes F1 passes Segments array with Status values
                                  if (!sec.Value && sec.Segments) {
                                      // Just a rough estimation based on segment status
                                      const hasGreen = Object.values(sec.Segments).some((seg:any) => seg.Status === 2049);
                                      const hasPurple = Object.values(sec.Segments).some((seg:any) => seg.Status === 2051);
                                      if (hasPurple) item.sectors[si] = 3;
                                      else if (hasGreen) item.sectors[si] = 2;
                                      else item.sectors[si] = 1;
                                  }
                               }
                           });
                        }
                        
                        if (lineData.InPit !== undefined) item.isPit = lineData.InPit;
                        
                        if (lineData.BestLapTime && lineData.BestLapTime.OverallFastest !== undefined) {
                           if (lineData.BestLapTime.OverallFastest) {
                              item.hasFastestLap = true;
                              fastestLapChanged = true;
                           }
                        }
                        
                        next[idx] = item;
                     }
                  });
                  
                  // If someone got the fastest lap, we should clear it from everyone else
                  if (fastestLapChanged) {
                      // We don't know who EXACTLY just got it unless we iterate, 
                      // but if they did, we realistically should clear the others.
                      // F1 TimingData usually emits `OverallFastest: true` for the new fast lap setter
                      // We already set it true for them. Let's find them, and set others to false.
                      const newFastestIdx = next.findIndex(n => n.hasFastestLap && data.TimingData.Lines[n.driverNumber.toString()]?.BestLapTime?.OverallFastest);
                      if (newFastestIdx !== -1) {
                         next.forEach((n, i) => {
                            if (i !== newFastestIdx) next[i] = { ...n, hasFastestLap: false };
                         });
                      }
                  }

                  return next;
               });
            }
          } catch (e) {
            // Unhandled Parse error
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          // Try to reconnect after 5s
          fallbackTimer = setTimeout(connect, 5000);
        };
      } catch (err) {
        console.error("Failed to connect WS", err);
      }
    };

    connect();

    return () => {
      if (ws) ws.close();
      clearTimeout(fallbackTimer);
    };
  }, []);

  // Merge static metadata with live data
  const combinedData = DRIVER_DATA.map(staticInfo => {
    const activeData = liveData.find(ld => ld.driverNumber === staticInfo.driver_season.driver_number);
    return {
      static: staticInfo,
      live: activeData || {
        position: staticInfo.rank,
        gapToLeader: '',
        interval: '',
        lastLapTime: '',
        bestLapTime: '',
        sectors: [0,0,0],
        hasFastestLap: false,
        drsActive: false,
        isPit: false,
        status: ''
      }
    };
  }).sort((a, b) => a.live.position - b.live.position);

  // Take only top 22 or those with positions
  const displayData = combinedData.filter(d => d.live.position > 0);

  return (
    <div className="flex flex-col h-full bg-[#050505] text-gray-200">
      {/* Header */}
      <header className="flex-none h-16 border-b border-white/10 bg-[#0a0a0a] flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10 w-full shrink-0">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="bg-red-600 text-white px-2 py-0.5 font-black text-sm tracking-tighter">F1</div>
          <div className="h-6 w-px bg-white/20"></div>
          <h1 className="text-sm font-semibold tracking-widest uppercase text-white flex items-center gap-2 leading-none whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] sm:max-w-none">
            {sessionStatus === 'Chequered Flag' ? <Flag className="w-4 h-4 text-white shrink-0" /> : <Timer className="w-4 h-4 text-white shrink-0" />}
            <span className="truncate">{sessionName}</span>
            {sessionType && <span className="text-gray-500 font-normal hidden sm:inline shrink-0">— {sessionType}</span>}
          </h1>
        </div>
        <div className="flex items-center gap-4 sm:gap-8">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", wsConnected ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-red-500 shadow-[0_0_8px_#ef4444]")}></div>
            <span className={cn("text-[10px] font-mono uppercase tracking-widest hidden sm:inline", wsConnected ? "text-emerald-500" : "text-red-500")}>
              {wsConnected ? 'Connected' : 'Offline'}
            </span>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-gray-500 uppercase tracking-widest">Lap</div>
            <div className="text-sm font-mono text-white">{sessionLap}</div>
          </div>
          <div className="text-right sm:hidden">
            <div className="text-sm font-mono text-white">L {sessionLap}</div>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden p-0 lg:p-4 gap-0 lg:gap-4 relative">
        
        {/* Race Control Messages / Notifications */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[90%] max-w-[400px] pointer-events-none">
          <AnimatePresence>
            {rcMsgs.map(msg => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="bg-[#d32f2f] border border-white/20 shadow-2xl rounded p-3 text-white text-sm font-bold tracking-wide flex items-start gap-3 pointer-events-auto"
              >
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="leading-snug text-shadow-sm">{msg.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {/* Leaderboard Section */}
        <section className="w-full lg:w-[60%] xl:w-[65%] flex flex-col overflow-hidden lg:bg-[#0c0c0c] lg:border border-white/5 lg:rounded-xl">
          {/* List Header */}
          <div className="grid grid-cols-12 gap-2 px-2 sm:px-4 py-2 sm:py-3 bg-[#111] text-[10px] uppercase tracking-wider font-bold text-gray-500 border-b border-white/5 sticky top-0 z-10 hidden sm:grid">
            <div className="col-span-1 text-center">Pos</div>
            <div className="col-span-4 pl-4">Driver / Team</div>
            <div className="col-span-2">Gap</div>
            <div className="col-span-2">Interval</div>
            <div className="col-span-3 text-right">Last Lap</div>
          </div>
          
          <div className="flex-1 overflow-y-auto w-full pb-20 lg:pb-0 no-scrollbar">
            <div className="flex flex-col w-full">
              {displayData.map((row) => (
                <DriverRow key={row.static.driver_id} row={row} />
              ))}
            </div>
          </div>
        </section>

        {/* Sidebar Widgets (hidden on mobile, flexible on desktop) */}
        <aside className="hidden lg:flex flex-1 flex-col gap-4 overflow-y-auto no-scrollbar pr-1">
          {/* Driver Focus Card (using Leader for now or the first driver) */}
          {displayData.length > 0 && (
            <div className="bg-[#0c0c0c] border border-white/5 rounded-xl p-4 md:p-6 relative overflow-hidden shrink-0">
              <div className="absolute -right-4 -bottom-4 opacity-20">
                 {displayData[0].static.driver_season.constructor.constructor_normalized_logo_url && (
                   <img 
                      src={displayData[0].static.driver_season.constructor.constructor_normalized_logo_url} 
                      alt="Constructor Background Logo"
                      className="w-40 h-40 object-contain grayscale" 
                   />
                 )}
              </div>
              <div className="flex justify-between items-start relative z-10">
                <div>
                  <div className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Race Leader</div>
                  <h2 className="text-2xl font-black italic uppercase text-white">
                    {displayData[0].static.driver_season.driver.full_name}
                  </h2>
                  <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">
                     {displayData[0].static.driver_season.constructor.name}
                  </div>
                </div>
                {displayData[0].static.driver_season.portrait_url && (
                    <img 
                      src={displayData[0].static.driver_season.portrait_url} 
                      alt={displayData[0].static.driver_season.driver.code}
                      className="w-20 h-20 rounded-full border-2 bg-[#111] object-cover shadow-2xl" 
                      style={{ borderColor: `rgb(${displayData[0].static.driver_season.constructor.color_rgb})` }}
                    />
                )}
              </div>
              <div className="mt-6 grid grid-cols-3 gap-2 relative z-10">
                <div className="bg-[#111] border border-white/5 p-2 rounded">
                   <div className="text-[9px] text-gray-500 uppercase font-semibold">Status</div>
                   <div className="text-sm font-mono text-white mt-1 uppercase tracking-wide">
                     {displayData[0].live.isPit ? 'IN PIT' : 'TRACK'}
                   </div>
                </div>
                <div className="bg-[#111] border border-white/5 p-2 rounded">
                   <div className="text-[9px] text-gray-500 uppercase font-semibold">Best Lap</div>
                   <div className="text-sm font-mono text-white mt-1">
                     {displayData[0].live.bestLapTime || '--:--.---'}
                   </div>
                </div>
                <div className="bg-[#111] border border-white/5 p-2 rounded">
                   <div className="text-[9px] text-gray-500 uppercase font-semibold">DRS</div>
                   <div className={cn("text-sm font-sans font-bold tracking-widest mt-1", displayData[0].live.drsActive ? "text-emerald-400" : "text-gray-500")}>
                     {displayData[0].live.drsActive ? 'ON' : 'OFF'}
                   </div>
                </div>
              </div>
            </div>
          )}

          {/* Circuit Info */}
          <div className="bg-[#0c0c0c] border border-white/5 rounded-xl p-4 md:p-6 flex flex-col shrink-0">
            <div className="flex justify-between items-center mb-6">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Track Status</div>
              <div className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                  sessionStatus === 'AllClear' || sessionStatus === 'In Progress' ? "bg-emerald-500/10 text-emerald-500" :
                  sessionStatus.toLowerCase().includes('yellow') ? "bg-yellow-500/10 text-yellow-500" :
                  sessionStatus.toLowerCase().includes('red') ? "bg-red-500/10 text-red-500" :
                  "bg-white/10 text-white"
              )}>
                {sessionStatus}
              </div>
            </div>
            
            <div className="flex-1 border-y border-white/5 py-8 flex flex-col justify-center items-center">
              <div className="text-center">
                <div className="text-[10px] font-bold text-gray-500 uppercase mb-2 tracking-widest">Current Lap</div>
                <div className="text-6xl font-black italic text-white flex items-baseline gap-2 justify-center">
                  {sessionLap}
                </div>
              </div>
            </div>
          </div>
          
        </aside>
      </main>
    </div>
  );
}

function DriverRow({ row }: { row: any }) {
  const { static: st, live } = row;
  const driverName = st.driver_season.driver.code; // Or Name? Image shows "L NORRIS", maybe first initial + last name
  const firstName = st.driver_season.driver.full_name.split(' ')[0];
  const lastName = st.driver_season.driver.name.toUpperCase();
  const displayName = `${firstName.charAt(0)} ${lastName}`;
  
  const teamColor = `rgb(${st.driver_season.constructor.color_rgb})`;

  // Sectors mapping: 1 = yellow (#eab308), 2 = green (#22c55e), 3 = purple (#a855f7)
  const getSectorColor = (val: number) => {
    switch (val) {
      case 1: return 'bg-yellow-400';
      case 2: return 'bg-green-500';
      case 3: return 'bg-fuchsia-500';
      default: return 'bg-white/10';
    }
  };

  return (
    <div className="grid grid-cols-12 items-center gap-2 px-2 sm:px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer relative bg-transparent group">
      <div 
        className="absolute inset-0 opacity-0 pointer-events-none group-hover:opacity-[0.06] transition-opacity"
        style={{
          background: `radial-gradient(circle at 10% 50%, ${teamColor} 0%, transparent 60%)`
        }}
      />
      
      <div className="col-span-1 text-center font-bold text-white text-base sm:text-lg z-10">{live.position}</div>
      <div className="col-span-6 flex flex-col sm:flex-row sm:col-span-4 justify-center sm:items-center gap-1 sm:gap-3 z-10">
        <div className="flex items-center relative gap-2 sm:gap-3 items-start sm:items-center">
          <div className="w-1 absolute sm:relative -left-2 sm:left-auto h-8 sm:h-10 rounded-full" style={{ backgroundColor: teamColor }} />
          <div className="min-w-0">
            <div className="text-sm sm:text-base font-bold text-white tracking-wide truncate flex items-center gap-1.5">
              <span className="truncate uppercase">{displayName}</span>
              <span className="text-[10px] text-gray-500 shrink-0">{st.driver_season.driver_number}</span>
              {live.hasFastestLap && (
                <Timer className="w-3 h-3 text-fuchsia-500 ml-1" />
              )}
              {live.drsActive && (
                <span className="ml-1 px-1 py-0.5 rounded text-[8px] font-bold bg-green-500/20 text-green-400 border border-green-500/30 font-sans tracking-wide hidden sm:inline-block">
                  DRS
                </span>
              )}
            </div>
            <div className="text-[10px] text-gray-400 uppercase truncate">
              {st.driver_season.constructor.name}
            </div>
          </div>
        </div>
      </div>
      
      {/* Gap / Status */}
      <div className="col-span-5 sm:col-span-2 flex flex-col sm:block text-right sm:text-left justify-center items-end sm:items-start z-10">
        <div className={cn("font-mono font-bold text-xl sm:text-lg tracking-tight", live.position === 1 ? "text-white" : "text-gray-400")}>
           {live.gapToLeader}
        </div>
        <div className="font-mono text-[10px] text-gray-500 sm:hidden">
          {live.lastLapTime || '--:--.---'}
        </div>
      </div>

      {/* Interval, only visible on larger screens */}
      <div className="col-span-2 font-mono text-sm text-gray-400 hidden sm:flex items-center z-10">
         {live.interval || '--'}
      </div>

      {/* Lap Time */}
      <div className="col-span-12 sm:col-span-3 flex justify-between sm:justify-end items-center mt-2 sm:mt-0 px-2 sm:px-0 z-10">
         <div className="flex gap-1">
            {live.sectors.map((sec: number, idx: number) => (
              <div 
                key={idx} 
                className={cn("h-1 w-6 sm:w-8 rounded-full", getSectorColor(sec))} 
              />
            ))}
         </div>
         <div className="text-right font-mono text-sm text-white hidden sm:block">
           {live.lastLapTime || '--:--.---'}
         </div>
      </div>
    </div>
  );
}
