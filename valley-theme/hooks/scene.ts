// Original scene: sky, drifting clouds, far blue hills, mint meadows, pines at
// the edges, a little stream. At night the sky turns deep blue with stars.
export const SCENE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
<style>
.sky{fill:url(#day)}
.far{fill:#a9c9de}.mid{fill:#bfe3cf}.near{fill:#9fd2b4}.front{fill:#7fbf98}
.pine{fill:#3f7a5c}.pine2{fill:#2f6249}
.cloud{fill:#fffaf0;opacity:.92}
.sun{fill:#ffe7c2;opacity:.9}
.star{fill:#fff6dc;opacity:0}
.stream{fill:#cfe6f2}
.flower{fill:#f6c6d3}
.c1{animation:drift 90s linear infinite}
.c2{animation:drift 130s linear infinite;animation-delay:-60s}
.c3{animation:drift 110s linear infinite;animation-delay:-30s}
.sway{transform-box:fill-box;transform-origin:50% 100%;animation:sway 9s ease-in-out infinite}
.glow{animation:glow 6s ease-in-out infinite}
@keyframes drift{from{transform:translateX(-400px)}to{transform:translateX(2000px)}}
@keyframes sway{0%,100%{transform:rotate(-1deg)}50%{transform:rotate(1deg)}}
@keyframes glow{0%,100%{opacity:.25}50%{opacity:.9}}
@media (prefers-color-scheme: dark){
.sky{fill:url(#night)}
.far{fill:#2a4660}.mid{fill:#24453c}.near{fill:#1e3c33}.front{fill:#18322a}
.pine{fill:#122820}.pine2{fill:#0e2119}
.cloud{fill:#3a5068;opacity:.5}
.sun{fill:#f3ead2;opacity:.95}
.star{opacity:.8}
.stream{fill:#2e4c66}
.flower{fill:#8a5c74}
}
</style>
<defs>
<linearGradient id="day" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bcdcf0"/><stop offset=".6" stop-color="#e4f0f2"/><stop offset="1" stop-color="#fbeee6"/></linearGradient>
<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e1a2e"/><stop offset=".7" stop-color="#1c3048"/><stop offset="1" stop-color="#2a3d4c"/></linearGradient>
</defs>
<!-- sky -->
<rect class="sky" width="1600" height="1000"/>
<circle class="sun" cx="1380" cy="150" r="58"/>
<g class="star">
<circle class="glow" cx="120" cy="90" r="2.4"/><circle cx="260" cy="170" r="1.8"/><circle class="glow" cx="420" cy="70" r="2"/>
<circle cx="610" cy="140" r="1.6"/><circle class="glow" cx="820" cy="60" r="2.2"/><circle cx="980" cy="160" r="1.8"/>
<circle class="glow" cx="1150" cy="90" r="2"/><circle cx="1500" cy="260" r="1.6"/><circle class="glow" cx="60" cy="260" r="1.8"/>
</g>
<!-- clouds -->
<g class="cloud c1"><ellipse cx="0" cy="180" rx="90" ry="30"/><ellipse cx="50" cy="160" rx="60" ry="34"/><ellipse cx="-50" cy="170" rx="50" ry="24"/></g>
<g class="cloud c2"><ellipse cx="0" cy="300" rx="120" ry="34"/><ellipse cx="60" cy="278" rx="70" ry="38"/></g>
<g class="cloud c3"><ellipse cx="0" cy="110" rx="70" ry="22"/><ellipse cx="34" cy="96" rx="44" ry="26"/></g>
<!-- hills -->
<path class="far" d="M0 640 Q200 470 420 560 T860 520 T1260 540 T1600 500 V1000 H0Z"/>
<path class="mid" d="M0 720 Q260 600 520 690 T1080 660 T1600 640 V1000 H0Z"/>
<path class="near" d="M0 820 Q300 720 640 800 T1240 770 T1600 760 V1000 H0Z"/>
<path class="stream" d="M1600 790 C1380 830 1300 880 1120 900 C980 915 900 960 860 1000 H940 C980 970 1060 945 1180 930 C1340 910 1440 860 1600 840Z"/>
<path class="front" d="M0 900 Q240 840 520 900 T1000 950 V1000 H0Z"/>
<!-- pines, left -->
<g class="sway"><path class="pine" d="M90 860 L140 700 L190 860Z M100 790 L140 650 L180 790Z M110 720 L140 600 L170 720Z"/></g>
<g class="sway"><path class="pine2" d="M180 880 L215 760 L250 880Z M188 820 L215 720 L242 820Z"/></g>
<g class="sway"><path class="pine" d="M20 900 L60 760 L100 900Z M30 830 L60 720 L90 830Z"/></g>
<!-- pines, right -->
<g class="sway"><path class="pine" d="M1440 820 L1490 650 L1540 820Z M1450 750 L1490 600 L1530 750Z M1460 680 L1490 560 L1520 680Z"/></g>
<g class="sway"><path class="pine2" d="M1370 830 L1405 720 L1440 830Z M1378 775 L1405 680 L1432 775Z"/></g>
<!-- meadow flowers -->
<g class="flower"><circle cx="300" cy="905" r="5"/><circle cx="340" cy="920" r="4"/><circle cx="410" cy="900" r="5"/><circle cx="1260" cy="860" r="4"/><circle cx="1310" cy="875" r="5"/></g>
</svg>`
