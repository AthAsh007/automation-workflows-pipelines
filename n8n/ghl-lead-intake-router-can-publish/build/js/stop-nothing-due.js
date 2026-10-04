// The sequence ran and nothing was due. This node's output is the run report: what is
// waiting, and what has been stopped and why — so a quiet day still says something rather
// than looking like a broken workflow.
const p = $input.first().json || {};
return [{
  json: {
    _outcome: 'nothing due',
    _reason: 'no lead is due a touch today',
    rows_read: p.rows_read,
    due_count: 0,
    waiting: p.waiting || [],
    stopped: p.stopped || [],
    board: p.board || {}
  }
}];
