import { getOfficerProposalPayments, getProposals } from "./api.js";
import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";

const money = (n) =>
  `₱ ${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "—");

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function getReceiptNo(p) {
  if (Array.isArray(p.receipts)) return p.receipts[0]?.receipt_no ?? "—";
  if (p.receipts && typeof p.receipts === "object") return p.receipts.receipt_no ?? "—";
  return "—";
}

function sumBreakdown(breakdown) {
  if (!Array.isArray(breakdown)) return 0;
  return breakdown.reduce((s, it) => s + Number(it?.amount || 0), 0);
}

function getRequiredPerStudent(proposal) {
  if (!proposal) return 0;
  const breakdownTotal = sumBreakdown(proposal.breakdown);
  return breakdownTotal > 0 ? breakdownTotal : Number(proposal.required_per_student || 0);
}

function badge(text, type) {
  return `<span class="badge text-bg-${type}">${text}</span>`;
}

async function init() {
  const content = document.getElementById("content");
  const auth = await requireRoles(["officer", "president"]);
  if (!auth) return;

  renderSidebar(document.getElementById("sidebar"), auth.role);

  const proposalId = qs("id");
  if (!proposalId) {
    content.innerHTML = `<div class="alert alert-warning">Missing proposal id.</div>`;
    return;
  }

  try {
    // payments list (should include receipts + student profile join)
    const payments = await getOfficerProposalPayments(proposalId);

    // Build student info map so "Student Payment Status" shows names (not UUID)
    const studentInfoById = new Map();
    for (const p of payments || []) {
      if (p.student_id && p.student) studentInfoById.set(p.student_id, p.student);
    }

    function studentCell(student_id) {
      const s = studentInfoById.get(student_id);

      const name =
        s?.full_name ||
        [s?.first_name, s?.middle_name, s?.last_name].filter(Boolean).join(" ") ||
        null;

      const extra =
        (s?.course ? s.course : "") +
        (s?.year_level ? ` - Yr ${s.year_level}` : "");

      return `
        <div>${name || student_id}</div>
        <div class="small text-muted">${extra}</div>
      `;
    }

    // get proposal info (title + required_per_student / breakdown)
    const proposals = await getProposals();
    const proposal = (proposals || []).find((p) => p.id === proposalId);

    const requiredPerStudent = getRequiredPerStudent(proposal);

    // totals
    const totalCollected = (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);

    // total paid per student (for fully/partial)
    const paidByStudent = new Map();
    for (const p of payments || []) {
      const sid = p.student_id;
      paidByStudent.set(sid, (paidByStudent.get(sid) || 0) + Number(p.amount || 0));
    }

    const studentRows = Array.from(paidByStudent.entries())
      .map(([student_id, totalPaid]) => {
        const fully = requiredPerStudent > 0 && totalPaid >= requiredPerStudent;
        const statusHtml =
          requiredPerStudent > 0
            ? fully
              ? badge("Fully Paid", "success")
              : badge("Partial Pay", "warning")
            : "—";
        return { student_id, totalPaid, statusHtml, fully };
      })
      .sort((a, b) => (b.totalPaid || 0) - (a.totalPaid || 0));

    const fullyPaidCount = studentRows.filter((r) => r.fully).length;
    const partialPaidCount = studentRows.length - fullyPaidCount;

    // helper to show status per payment row based on student total
    const statusForStudent = (student_id) => {
      const totalPaid = paidByStudent.get(student_id) || 0;
      if (requiredPerStudent <= 0) return "—";
      return totalPaid >= requiredPerStudent
        ? badge("Fully Paid", "success")
        : badge("Partial Pay", "warning");
    };

    content.innerHTML = `
      <div class="mb-3">
        <div class="card card-soft p-3">
          <div class="row g-3">
            <div class="col-12 col-md-4">
              <div class="text-muted">Event</div>
              <div style="font-weight:700">${proposal?.title ?? proposalId}</div>
            </div>

            <div class="col-12 col-md-4">
              <div class="text-muted">Required / Student</div>
              <div style="font-weight:700">${requiredPerStudent > 0 ? money(requiredPerStudent) : "—"}</div>
            </div>

            <div class="col-12 col-md-4">
              <div class="text-muted">Total Collected</div>
              <div style="font-weight:700">${money(totalCollected)}</div>
            </div>

            <div class="col-12 col-md-4">
              <div class="text-muted">Students Paid</div>
              <div style="font-weight:700">${studentRows.length}</div>
            </div>

            <div class="col-12 col-md-4">
              <div class="text-muted">Fully Paid</div>
              <div style="font-weight:700">${fullyPaidCount}</div>
            </div>

            <div class="col-12 col-md-4">
              <div class="text-muted">Partial Pay</div>
              <div style="font-weight:700">${partialPaidCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card card-soft p-3 mb-3">
        <h5 class="mb-3">Student Payment Status</h5>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Student</th>
                <th>Total Paid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${
                studentRows.length
                  ? studentRows
                      .map(
                        (r) => `
                          <tr>
                            <td>${studentCell(r.student_id)}</td>
                            <td>${money(r.totalPaid)}</td>
                            <td>${r.statusHtml}</td>
                          </tr>
                        `
                      )
                      .join("")
                  : `<tr><td colspan="3" class="text-muted">No payments yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="card card-soft p-3">
        <h5 class="mb-3">Payments List</h5>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Student</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Ref</th>
                <th>Date</th>
                <th>Status</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              ${
                (payments || []).length
                  ? payments
                      .map(
                        (p) => `
                          <tr>
                            <td>${studentCell(p.student_id)}</td>
                            <td>${money(p.amount)}</td>
                            <td>${p.method || "—"}</td>
                            <td>${p.reference_no || "—"}</td>
                            <td>${fmtDate(p.paid_at)}</td>
                            <td>${statusForStudent(p.student_id)}</td>
                            <td>${getReceiptNo(p)}</td>
                          </tr>
                        `
                      )
                      .join("")
                  : `<tr><td colspan="7" class="text-muted">No payments yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}

init();