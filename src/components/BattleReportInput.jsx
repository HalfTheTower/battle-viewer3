// components/BattleReportInput.jsx
import { TAB_COLORS } from "../battleConstants";

export default function BattleReportInput({
  input,
  setInput,
  saveReport,
  filterType,
  onFilterClick,
  isMobile
}) {
  return (
    <div>
      {/* 입력창 */}
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Battle Report 붙여넣기"
        style={{
          width: "100%",
          height: 120,
          padding: 12,
          borderRadius: 10,
          border: "1px solid #ddd",
          background: "#fafafa",
          resize: "none",
          fontSize: 13,
          lineHeight: 1.4,
          fontFamily: "monospace",
          boxShadow: "inset 0 1px 4px rgba(0,0,0,0.08)",
          boxSizing: "border-box"
        }}
      />

      {/* 저장 + 필터 버튼 (같은 줄) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginTop: 10
        }}
      >
        {/* 왼쪽: 저장 버튼 */}
        <button
          onClick={saveReport}
          style={{
            background: "#4CAF50",
            color: "white",
            fontWeight: 700,
            padding: "8px 14px",
            borderRadius: 8,
            border: "none"
          }}
        >
          저장
        </button>

        {/* 오른쪽: 필터 버튼들 */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 6
          }}
        >
          {Object.keys(TAB_COLORS).map((tab) => (
            <button
              key={tab}
              onClick={() => onFilterClick(tab)}
              style={{
                padding: isMobile ? "5px 8px" : "6px 12px",
                border: "none",
                borderRadius: 6,
                background:
                  filterType === tab
                    ? TAB_COLORS[tab]
                    : TAB_COLORS[tab] + "55",
                color: "white",
                fontWeight: 700,
                fontSize: isMobile ? 11 : 13,
                whiteSpace: "nowrap"
              }}
            >
              {tab}
            </button>
          ))}

          {/* 낭비 필터 */}
          <button
            onClick={() => onFilterClick("낭비")}
            style={{
              padding: isMobile ? "5px 8px" : "6px 12px",
              border: "none",
              borderRadius: 6,
              background:
                filterType === "낭비" ? "#999" : "#9995",
              color: "white",
              fontWeight: 700,
              fontSize: isMobile ? 11 : 13,
              whiteSpace: "nowrap",
              WebkitTextSizeAdjust: "100%"
            }}
          >
            낭비
          </button>
        </div>
      </div>
    </div>
  );
}
