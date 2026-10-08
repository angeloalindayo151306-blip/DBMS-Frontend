import { getOfficerProposalPayments, getProposals } from "./api.js";
import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";

const el = (id) => document.getElementById(id);

const money = (n) =>
  `₱ ${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "—");

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  return `<span class="badge text-bg-${type}">${escapeHtml(text)}</span>`;
}

function setMsg(html) {
  el("msg").innerHTML = html || "";
}

async function init() {
  const auth = await requireRoles(["officer", "president"]);
  if (!auth) return;

  renderSidebar(el("sidebar"), auth.role);

  const proposalId = qs("id");
  if (!proposalId) {
    setMsg(`<div class="alert alert-warning">Missing proposal id.</div>`);
    return;
  }

  try {
    // Payments list (includes receipts + student join)
    const payments = await getOfficerProposalPayments(proposalId);

    // Student info map
    const studentInfoById = new Map();
    for (const p of payments || []) {
      if (p.student_id && p.student) studentInfoById.set(p.student_id, p.student);
    }

    function studentNameAndExtra(student_id) {
      const s = studentInfoById.get(student_id);

      const name =
        s?.full_name ||
        [s?.first_name, s?.middle_name, s?.last_name].filter(Boolean).join(" ") ||
        null;

      const extra =
        (s?.course ? s.course : "") + (s?.year_level ? ` - Yr ${s.year_level}` : "");

      return {
        name: name || student_id,
        extra,
      };
    }

    function studentCell(student_id) {
      const info = studentNameAndExtra(student_id);
      return `
        <div>${escapeHtml(info.name)}</div>
        <div class="small text-muted">${escapeHtml(info.extra)}</div>
      `;
    }

    // Proposal info
    const proposals = await getProposals();
    const proposal = (proposals || []).find((p) => p.id === proposalId);

    el("proposalTitle").textContent = proposal?.title || proposalId;

    const requiredPerStudent = getRequiredPerStudent(proposal);

    // totals
    const totalCollected = (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);

    // total paid per student
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

    // status per payment row based on student total
    const statusForStudent = (student_id) => {
      const totalPaid = paidByStudent.get(student_id) || 0;
      if (requiredPerStudent <= 0) return "—";
      return totalPaid >= requiredPerStudent
        ? badge("Fully Paid", "success")
        : badge("Partial Pay", "warning");
    };

    // Summary UI
    el("sRequired").textContent = requiredPerStudent > 0 ? money(requiredPerStudent) : "—";
    el("sCollected").textContent = money(totalCollected);
    el("sStudentsPaid").textContent = String(studentRows.length);
    el("sFullyPaid").textContent = String(fullyPaidCount);
    el("sPartialPaid").textContent = String(partialPaidCount);

    // Completion (fully paid ratio among students who paid)
    const denom = studentRows.length || 0;
    const pct = denom ? Math.round((fullyPaidCount / denom) * 100) : 0;
    el("sCompletionText").textContent = denom ? `${pct}%` : "—";
    el("sCompletionBar").style.width = `${pct}%`;
    el("sCompletionBar").className = `progress-bar ${pct >= 80 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-danger"}`;

    // Breakdown UI
    const breakdown = Array.isArray(proposal?.breakdown) ? proposal.breakdown : [];
    if (!breakdown.length) {
      el("breakdownWrap").innerHTML = `<div class="text-muted">No breakdown stored.</div>`;
    } else {
      const total = sumBreakdown(breakdown);
      el("breakdownWrap").innerHTML = `
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Item</th>
                <th class="text-end">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${breakdown
                .map(
                  (it) => `
                  <tr>
                    <td>${escapeHtml(it.name || "")}</td>
                    <td class="text-end">${money(it.amount)}</td>
                  </tr>
                `
                )
                .join("")}
              <tr>
                <td class="fw-bold">Total</td>
                <td class="text-end fw-bold">${money(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }

    // Render student status table
    const allStudentStatus = studentRows.map((r) => {
      const info = studentNameAndExtra(r.student_id);
      return {
        ...r,
        _nameSearch: `${info.name} ${info.extra}`.toLowerCase(),
        _statusKey: r.fully ? "fully" : "partial",
      };
    });

    function renderStudents() {
      const q = (el("studentSearch").value || "").toLowerCase().trim();
      const f = el("studentFilter").value;

      const rows = allStudentStatus.filter((r) => {
        if (f !== "all" && r._statusKey !== f) return false;
        if (q && !r._nameSearch.includes(q)) return false;
        return true;
      });

      el("studentMeta").textContent = `Showing ${rows.length} of ${allStudentStatus.length} paying student(s)`;

      const tbody = el("studentsTbody");
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-muted">No payments yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = rows
        .map(
          (r) => `
          <tr>
            <td>${studentCell(r.student_id)}</td>
            <td>${money(r.totalPaid)}</td>
            <td>${r.statusHtml}</td>
          </tr>
        `
        )
        .join("");
    }

    el("studentSearch").addEventListener("input", renderStudents);
    el("studentFilter").addEventListener("change", renderStudents);
    renderStudents();

    // Render payments list table
    const paymentRows = (payments || []).map((p) => {
      const info = studentNameAndExtra(p.student_id);
      const receipt = getReceiptNo(p);
      const hay = `${info.name} ${info.extra} ${p.reference_no || ""} ${receipt || ""}`.toLowerCase();
      return { p, hay, receipt };
    });

    function renderPayments() {
      const q = (el("paymentSearch").value || "").toLowerCase().trim();
      const rows = q ? paymentRows.filter((x) => x.hay.includes(q)) : paymentRows;

      el("paymentsMeta").textContent = `Showing ${rows.length} of ${paymentRows.length} payment(s)`;

      const tbody = el("paymentsTbody");
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-muted">No payments yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = rows
        .map(({ p, receipt }) => {
          return `
            <tr>
              <td>${studentCell(p.student_id)}</td>
              <td>${money(p.amount)}</td>
              <td>${escapeHtml(p.method || "—")}</td>
              <td>${escapeHtml(p.reference_no || "—")}</td>
              <td>${fmtDate(p.paid_at)}</td>
              <td>${statusForStudent(p.student_id)}</td>
              <td>${escapeHtml(receipt)}</td>
            </tr>
          `;
        })
        .join("");
    }

    el("paymentSearch").addEventListener("input", renderPayments);
    renderPayments();
  } catch (e) {
    setMsg(`<div class="alert alert-danger">${e.message}</div>`);
  }
}

init();