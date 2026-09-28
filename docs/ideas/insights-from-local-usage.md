# Insights from local usage

| | |
|---|---|
| **Status** | Parked / not scheduled |
| **Date** | 2026-09-05 |
| **Source** | Eric |

Token Police already keeps quota and usage history in `chrome.storage.local`. This note parks a direction for that data — it is not a spec and nothing here is scheduled.

## Near term (optional)

A **manual export** of some of the raw usage / quota data the extension already has locally. User-initiated only. Fine to skip entirely; a raw dump is not the goal.

## Longer term (preferred)

Evolve past a JSON/CSV dump into a personal **Insight**: usage patterns, burn rate, habits. Insights is the north-star evolution of export — the thing worth building if this idea is picked up later.

## Privacy

Data stays local. Any export or Insight is user-initiated. Usage numbers are not sent to a server (same contract as the rest of the extension).

---

# 从本地用量生成 Insight

| | |
|---|---|
| **状态** | 已搁置 / 未排期 |
| **日期** | 2026-09-05 |
| **来源** | Eric |

Token Police 已经把配额和用量历史存在本地 `chrome.storage.local`。这条笔记只是把方向记下来——不是规格，也没有排期。

## 近期（可选）

让用户**手动导出**扩展本地已有的部分原始用量 / 配额数据。必须由用户主动触发。可以完全不做；原始 dump 不是目标。

## 更远期（更想做的）

不要停在 JSON/CSV 导出，而是生成一份个人 **Insight**：用量模式、消耗速度、使用习惯。Insight 才是导出这件事该演变成的北极星。

## 隐私

数据留在本地。导出或 Insight 都由用户主动发起。用量数字不发到任何服务器（和扩展其余部分同一约定）。
