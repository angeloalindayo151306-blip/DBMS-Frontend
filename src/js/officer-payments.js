import { getOfficerProposalPayments, getProposals } from "./api.js";
import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";

const el = (id) => document.getElementById(id);

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const money = (n) =>
  `₱ ${num(n).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

const fmtDate = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

const formatCcsId = (n) => (n ? `CCS-${String(n).padStart(6, "0")}` : "—");

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
  return breakdown.reduce((s, it) => s + num(it?.amount), 0);
}

function getRequiredPerStudent(proposal) {
  if (!proposal) return 0;
  const breakdownTotal = sumBreakdown(proposal.breakdown);
  return breakdownTotal > 0 ? breakdownTotal : num(proposal.required_per_student);
}

function badge(text, type) {
  return `<span class="badge text-bg-${type}">${escapeHtml(text)}</span>`;
}

function setMsg(html) {
  el("msg").innerHTML = html || "";
}

function creatorLabel(proposal) {
  const c = proposal?.creator;
  if (!c) return "—";
  const name =
    c.full_name ||
    [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ") ||
    "—";
  const title = c.officer_title ? ` (${c.officer_title})` : "";
  return `${name}${title}`;
}

// inserts (or updates) a “Submitted by” line under the event title
function setProposalByLine(text) {
  const titleEl = el("proposalTitle");
  if (!titleEl) return;

  const parent = titleEl.parentElement;
  if (!parent) return;

  let byEl = document.getElementById("proposalByLine");
  if (!byEl) {
    byEl = document.createElement("div");
    byEl.id = "proposalByLine";
    byEl.className = "text-muted small mt-1";
    parent.appendChild(byEl);
  }

  byEl.innerHTML = `Submitted by: <b>${escapeHtml(text)}</b>`;
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
    const payments = await getOfficerProposalPayments(proposalId);

    const studentInfoById = new Map();
    for (const p of payments || []) {
      const embeddedStudent = p.student || p.profiles || p.student_profile || null;
      if (p.student_id && embeddedStudent) studentInfoById.set(p.student_id, embeddedStudent);
    }

    function studentInfo(student_id) {
      const s = studentInfoById.get(student_id);

      const name =
        s?.full_name ||
        [s?.first_name, s?.middle_name, s?.last_name].filter(Boolean).join(" ") ||
        null;

      const extra = (s?.course ? s.course : "") + (s?.year_level ? ` - Yr ${s.year_level}` : "");
      const idNo = formatCcsId(s?.ccs_id_no);

      return { name: name || student_id, extra, idNo };
    }

    function studentCell(student_id) {
      const info = studentInfo(student_id);
      return `
        <div class="fw-semibold">${escapeHtml(info.name)}</div>
        <div class="small text-muted">${escapeHtml(info.extra)}</div>
      `;
    }

    function studentIdCell(student_id) {
      const info = studentInfo(student_id);
      return `<span class="text-nowrap">${escapeHtml(info.idNo)}</span>`;
    }

    // Proposal info (now includes `creator`)
    const proposals = await getProposals();
    const proposal = (proposals || []).find((p) => String(p.id) === String(proposalId));

    el("proposalTitle").textContent = proposal?.title || proposalId;
    setProposalByLine(creatorLabel(proposal));

    const requiredPerStudent = getRequiredPerStudent(proposal);

    const totalCollected = (payments || []).reduce((s, p) => s + num(p.amount), 0);

    const paidByStudent = new Map();
    for (const p of payments || []) {
      const sid = p.student_id;
      paidByStudent.set(sid, (paidByStudent.get(sid) || 0) + num(p.amount));
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

    const statusForStudent = (student_id) => {
      const totalPaid = paidByStudent.get(student_id) || 0;
      if (requiredPerStudent <= 0) return "—";
      return totalPaid >= requiredPerStudent
        ? badge("Fully Paid", "success")
        : badge("Partial Pay", "warning");
    };

    el("sRequired").textContent = requiredPerStudent > 0 ? money(requiredPerStudent) : "—";
    el("sCollected").textContent = money(totalCollected);
    el("sStudentsPaid").textContent = String(studentRows.length);
    el("sFullyPaid").textContent = String(fullyPaidCount);
    el("sPartialPaid").textContent = String(partialPaidCount);

    const denom = studentRows.length || 0;
    const pct = denom ? Math.round((fullyPaidCount / denom) * 100) : 0;
    el("sCompletionText").textContent = denom ? `${pct}%` : "—";
    el("sCompletionBar").style.width = `${pct}%`;
    el("sCompletionBar").className = `progress-bar ${
      pct >= 80 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-danger"
    }`;

    // Breakdown
    const breakdown = Array.isArray(proposal?.breakdown) ? proposal.breakdown : [];
    if (!breakdown.length) {
      el("breakdownWrap").innerHTML = `<div class="text-muted">No breakdown stored.</div>`;
    } else {
      const total = sumBreakdown(breakdown);
      el("breakdownWrap").innerHTML = `
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr><th>Item</th><th class="text-end">Amount</th></tr>
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

    const allStudentStatus = studentRows.map((r) => {
      const info = studentInfo(r.student_id);
      return {
        ...r,
        _nameSearch: `${info.name} ${info.extra} ${info.idNo}`.toLowerCase(),
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
        tbody.innerHTML = `<tr><td colspan="4" class="text-muted">No payments yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = rows
        .map(
          (r) => `
            <tr>
              <td>${studentCell(r.student_id)}</td>
              <td>${studentIdCell(r.student_id)}</td>
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

    const paymentRows = (payments || []).map((p) => {
      const info = studentInfo(p.student_id);
      const receipt = getReceiptNo(p);
      const hay = `${info.name} ${info.extra} ${info.idNo} ${p.reference_no || ""} ${receipt || ""}`.toLowerCase();
      return { p, hay, receipt };
    });

    function renderPayments() {
      const q = (el("paymentSearch").value || "").toLowerCase().trim();
      const rows = q ? paymentRows.filter((x) => x.hay.includes(q)) : paymentRows;

      el("paymentsMeta").textContent = `Showing ${rows.length} of ${paymentRows.length} payment(s)`;

      const tbody = el("paymentsTbody");
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-muted">No payments yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = rows
        .map(
          ({ p, receipt }) => `
            <tr>
              <td>${studentCell(p.student_id)}</td>
              <td>${studentIdCell(p.student_id)}</td>
              <td>${money(p.amount)}</td>
              <td>${escapeHtml(p.method || "—")}</td>
              <td>${escapeHtml(p.reference_no || "—")}</td>
              <td>${fmtDate(p.paid_at)}</td>
              <td>${statusForStudent(p.student_id)}</td>
              <td>${escapeHtml(receipt)}</td>
            </tr>
          `
        )
        .join("");
    }

    el("paymentSearch").addEventListener("input", renderPayments);
    renderPayments();
  } catch (e) {
    setMsg(`<div class="alert alert-danger">${escapeHtml(e.message)}</div>`);
  }
}

init();