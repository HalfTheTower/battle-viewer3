import { useState, useEffect } from "react";
import { parseNumber, formatNumber } from "./parser";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, LabelList } from "recharts";
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

export default function App() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState([]);
  const [savedList, setSavedList] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [activeTab, setActiveTab] = useState("배틀리포트");
  const [filterType, setFilterType] = useState("전체");

  const tabColors = {
    전체: "#8884d8",
    파밍: "#36a2eb",
    토너: "#ff6384",
    등반: "#4bc0c0",
    리롤: "#ffcd56",
  };

  const COLORS = [
    "#ff6384","#36a2eb","#ffcd56","#4bc0c0","#9966ff","#ff9f40","#00c49f","#ff4444","#8884d8","#82ca9d",
  ];

  useEffect(() => { loadSavedList(); }, []);

  const parseBattleDate = (raw) => {
    const match = raw.match(/Battle Date\s+([A-Za-z]{3}) (\d{2}), (\d{4}) (\d{2}:\d{2})/);
    if (!match) return new Date(0);
    const [, monStr, day, year, time] = match;
    const months = { Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
                     Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" };
    return new Date(`${year}-${months[monStr]}-${day}T${time}:00`);
  };

  const formatBattleDate = (raw) => {
    const match = raw.match(/Battle Date\s+([A-Za-z]{3}) (\d{2}), (\d{4}) (\d{2}:\d{2})/);
    if (!match) return null;
    const [, monStr, day, year, time] = match;
    const months = { Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
                     Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" };
    return `${year}-${months[monStr]}-${day} ${time}`;
  };

  const extractSummary = (raw) => {
    const tier = raw.match(/Tier\s+(\d+)/)?.[1] + "T" || "-";
    const wave = raw.match(/Wave\s+(\d+)/)?.[1] + "W" || "-";
    const cph = raw.match(/Coins per hour\s+([\d.]+\w+)/)?.[1] + "/h" || "-";
    return `${tier} ${wave} ${cph}`;
  };

  const loadSavedList = async () => {
    const snap = await getDocs(collection(db, "reports"));
    const arr = [];
    snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
    arr.sort((a,b) => parseBattleDate(b.raw) - parseBattleDate(a.raw));
    setSavedList(arr);
  };

  const saveReport = async () => {
    if (!input.trim()) return alert("입력값이 없어!");
    if (savedList.some(r => r.raw === input)) return alert("이미 등록된 전투기록입니다!");
    await addDoc(collection(db, "reports"), { raw: input, timestamp: Date.now(), type:"전체" });
    alert("저장 완료!");
    setInput("");
    loadSavedList();
  };

  const loadReport = (item) => {
    setSelectedReport(item);
    setInput(item.raw);
    setResult([]);
  };

  const deleteReport = async (id) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "reports", id));
    if (selectedReport?.id === id) setSelectedReport(null);
    loadSavedList();
  };

  const changeReportType = async (id, type) => {
    await updateDoc(doc(db, "reports", id), { type });
    setSelectedReport(prev => prev ? { ...prev, type } : null);
    await loadSavedList();
  };

  const ignoreList = [
    "damage taken","damage taken wall","damage taken while berserked",
    "damage gain from berserk","death defy","lifesteal","projectiles count",
    "enemies hit by orbs","land mines spawned","tagged by deathwave"
  ];

  const analyze = () => {
    const lines = input.split("\n");
    let totalDamage = 0, damages = [];
    for (let line of lines) {
      if (line.toLowerCase().startsWith("damage dealt")) {
        const value = line.split("\t")[1]?.trim() || line.split(":")[1]?.trim();
        totalDamage = parseNumber(value);
      }
    }
    if (!totalDamage) { setResult([{name:"총 대미지를 찾을 수 없음", percent:0}]); return; }

    for (let line of lines) {
      if (!line.toLowerCase().includes("damage") || line.toLowerCase().startsWith("damage dealt")) continue;
      let name = (line.split("\t")[0] || line.split(":")[0]).trim().toLowerCase();
      if (ignoreList.some(ig => name.includes(ig))) continue;
      let value = line.split("\t")[1]?.trim() || (line.includes(":")?line.split(":")[1]?.trim():null);
      if (!value) continue;
      const num = parseNumber(value);
      const pct = (num / totalDamage) * 100;
      if (pct<1) continue;
      damages.push({name: name.charAt(0).toUpperCase()+name.slice(1), percent: pct});
    }

    damages.sort((a,b)=>b.percent-a.percent);
    damages.push({name:"합계", percent: damages.reduce((acc,c)=>acc+c.percent,0)});
    setResult(damages);
  };

  const dailyStats = () => {
    const stats = {};
    savedList.forEach(item => {
      const formatted = formatBattleDate(item.raw);
      if (!formatted) return;
      const date = formatted.split(" ")[0];

      // Real Time 문자열 그대로 가져오기
      const timeLine = item.raw.split("\n").find(l => l.includes("Real Time"));
      const realTimeStr = timeLine?.split("\t")[1]?.trim() || timeLine?.split(":")[1]?.trim() || "0h 0m";

      let h = 0, m = 0, s = 0;
      if (timeLine) {
        const hMatch = timeLine.match(/(\d+)h/);
        const mMatch = timeLine.match(/(\d+)m/);
        const sMatch = timeLine.match(/(\d+)s/);
        h = hMatch ? parseInt(hMatch[1]) : 0;
        m = mMatch ? parseInt(mMatch[1]) : 0;
        s = sMatch ? parseInt(sMatch[1]) : 0;
      }

      const seconds = h*3600 + m*60 + s;
      const coinsLine = item.raw.split("\n").find(l=>l.includes("Coins earned"));
      const coins = parseNumber(coinsLine?.split("\t")[1]?.trim() || coinsLine?.split(":")[1]?.trim() || "0");

      if (!stats[date]) stats[date] = { coins:0, seconds:0, typeSeconds: { 파밍:0, 토너:0, 등반:0, 리롤:0 }, realTimeStr };
      stats[date].coins += coins;
      stats[date].seconds += seconds;
      stats[date].realTimeStr = realTimeStr;

      if (item.type && item.type !== "전체") stats[date].typeSeconds[item.type] += seconds;
    });

    return Object.entries(stats)
      .filter(([date]) => date)
      .sort(([a],[b]) => new Date(b) - new Date(a));
  };

  return (
    <div style={{padding:"20px", maxWidth:900, margin:"0 auto"}}>
      <h1 style={{textAlign:"center", marginBottom:16}}>Battle Report</h1>

      <div style={{display:"flex", gap:8, marginBottom:12}}>
        {['배틀리포트','날짜별 통계'].map(t => (
          <button key={t} onClick={()=>setActiveTab(t)} style={{flex:1, padding:10, borderRadius:8, border:'none', background: activeTab===t? '#0077b6':'#eee', color: activeTab===t? 'white':'#333', fontWeight:'600', cursor:'pointer'}}>{t}</button>
        ))}
      </div>

      {activeTab === '배틀리포트' && (
        <div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:10}}>
            {Object.keys(tabColors).map(tab => (
              <button key={tab} onClick={()=>setFilterType(tab)} style={{padding:'6px 12px', border:'none', borderRadius:6, background: filterType===tab? tabColors[tab]: tabColors[tab]+'55', color:'white', fontWeight:700, cursor:'pointer'}}>{tab}</button>
            ))}
          </div>

          <div style={{marginBottom:18}}>
            <h2 style={{marginBottom:8}}>저장된 리포트</h2>
            <div style={{display:'flex', flexDirection:'column', gap:10}}>
              {savedList.filter(r=>filterType==='전체' || r.type===filterType).map(item => {
                const battleDate = formatBattleDate(item.raw) || "날짜 없음";
                const summary = extractSummary(item.raw);
                const isSelected = selectedReport?.id === item.id;
                return (
                  <div key={item.id} onClick={()=>loadReport(item)} style={{padding:12, borderRadius:10, background: tabColors[item.type]+'22', boxShadow: isSelected? '0 0 0 2px rgba(0,0,0,0.12) inset':'0 2px 6px rgba(0,0,0,0.08)', cursor:'pointer'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                      <div style={{fontWeight:700}}>{battleDate}</div>
                      <div style={{fontSize:12, color:'#555'}}>{item.type}</div>
                    </div>
                    <div style={{marginTop:6, color:'#444'}}>{summary}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedReport && (
            <div style={{display:'flex', gap:10, marginBottom:12}}>
              <select value={selectedReport.type} onChange={e=>changeReportType(selectedReport.id, e.target.value)} style={{padding:8, borderRadius:6}}>
                {Object.keys(tabColors).map(tab => <option key={tab} value={tab}>{tab}</option>)}
              </select>
              <button onClick={()=>deleteReport(selectedReport.id)} style={{padding:'8px 12px', background:'#ff4444', color:'white', border:'none', borderRadius:6, fontWeight:700}}>삭제</button>
            </div>
          )}

          <textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="여기에 Battle Report 붙여넣기" style={{width:'100%', height:220, padding:10, borderRadius:10, border:'1px solid #ddd', fontSize:14}} />

          <div style={{display:'flex', gap:10, marginTop:10}}>
            <button onClick={analyze} style={{flex:1, padding:10, borderRadius:8}}>분석</button>
            <button onClick={saveReport} style={{flex:1, padding:10, borderRadius:8, background:'#4CAF50', color:'white', border:'none', fontWeight:700}}>저장</button>
          </div>

          {result.length>0 && result[0].name !== '총 대미지를 찾을 수 없음' && (
            <div style={{marginTop:26}}>
              <h2>데미지 비율</h2>
              <div style={{height:300}}>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={result.filter(d=>d.name!=='합계')} dataKey='percent' nameKey='name' outerRadius={100} label={false}>
                      {result.filter(d=>d.name!=='합계').map((entry, i)=>(<Cell key={i} fill={COLORS[i%COLORS.length]} />))}
                    </Pie>
                    <Tooltip formatter={v=>v.toFixed(2)+'%'} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {result.length>0 && (
            <div style={{marginTop:20}}>
              <h2>데미지 목록</h2>
              <div style={{display:'flex', flexDirection:'column', gap:6}}>
                {result.filter(r=>r.name!=='합계').map((item, i) => (
                  <div key={i}><b>{item.name}:</b> {item.percent.toFixed(2)}%</div>
                ))}
              </div>
              <div style={{marginTop:10, fontWeight:700}}>합계: {result[result.length-1].percent.toFixed(2)}%</div>
            </div>
          )}

        </div>
      )}

      {activeTab === '날짜별 통계' && (
        <div style={{marginTop:20}}>
          <h2>날짜별 통계 (24시간 기준)</h2>
          {dailyStats().map(([date, stat]) => {
            const totalSecondsByType = Object.values(stat.typeSeconds).reduce((a,b)=>a+b,0);
            const totalSecondsAll = stat.seconds || 0;
            const usedSeconds = totalSecondsByType > 0 ? totalSecondsByType : totalSecondsAll;
            const daySeconds = 24 * 3600;
            const fullPercent = isNaN(usedSeconds/daySeconds*100) ? 0 : (usedSeconds/daySeconds*100);
            const fullPercentStr = fullPercent.toFixed(2);
            const wastePercent = Math.max(0, 100 - parseFloat(fullPercentStr)).toFixed(2);
            const typePercents = Object.fromEntries(Object.entries(stat.typeSeconds).map(([k,v])=>[k, (v/daySeconds*100).toFixed(2)]));

            return (
              <div key={date} style={{padding:14, marginBottom:14, borderRadius:10, background:'#f7f7f7', boxShadow:'0 2px 6px rgba(0,0,0,0.08)'}}>
                <div style={{fontWeight:700, fontSize:16}}>{date}</div>
                <div style={{marginTop:6}}>Coins: <b>{formatNumber(stat.coins)}</b></div>
                <div>Real Time: <b>{stat.realTimeStr}</b></div>
<div style={{marginTop:6}}>
  
<ResponsiveContainer width="100%" height={20}>
  <BarChart
    data={[{name:'전체', value: fullPercent}]}
    layout="vertical"
    margin={{ top:0, right:0, bottom:0, left:0 }}
  >
    <XAxis type="number" domain={[0,100]} hide />
    <YAxis type="category" dataKey="name" hide />
<Bar dataKey="value" fill="#0077b6" isAnimationActive={false} background={{ fill: "#ddd" }}>
  <LabelList 
    dataKey="value" 
    position="insideRight" 
    formatter={v => `${v.toFixed(2)}%`} 
    fill="#fff" 
    fontSize={12} 
    fontWeight={600} 
    offset={5} 
  />
</Bar>
  </BarChart>
</ResponsiveContainer>

</div>

                <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginTop:8}}>
                  <div>파밍: <b>{typePercents.파밍}%</b></div>
                  <div>토너: <b>{typePercents.토너}%</b></div>
                  <div>등반: <b>{typePercents.등반}%</b></div>
                  <div>리롤: <b>{typePercents.리롤}%</b></div>
                </div>
                <div style={{marginTop:8}}>낭비 시간: <b>{wastePercent}%</b></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
