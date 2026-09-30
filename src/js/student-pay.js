import { getEvents, createPayment } from './api.js';
import { requireRoles } from './guard.js';
import { renderSidebar } from './ui.js';

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function init() {
  const content = document.getElementById('content');
  const auth = await requireRoles(['student']);
  if (!auth) return;

  renderSidebar(document.getElementById('sidebar'), auth.role);

  try {
    const events = await getEvents();
    const proposalIdFromUrl = qs('proposal_id');

    content.innerHTML = `
      <div class="card card-soft p-3" style="max-width:720px;">
        <form id="payForm">
          <div class="mb-3">
            <label class="form-label">Event</label>
            <select class="form-select" id="proposal_id" required>
              <option value="" disabled ${
                proposalIdFromUrl ? '' : 'selected'
              }>Select event</option>
              ${(events || [])
                .map(
                  (e) => `
                <option value="${e.id}" ${
                    proposalIdFromUrl === e.id ? 'selected' : ''
                  }>
                  ${e.title}
                </option>
              `
                )
                .join('')}
            </select>
          </div>

          <div class="mb-3">
            <label class="form-label">Payment Method</label>
            <select class="form-select" id="method" required>
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="bank_transfer">Bank Transfer</option>
            </select>
          </div>

          <div class="mb-3">
            <label class="form-label">Amount</label>
            <input class="form-control" id="amount" type="number" min="1" step="0.01" required />
          </div>

          <div class="mb-3">
            <label class="form-label">Reference Number (optional for cash)</label>
            <input class="form-control" id="reference_no" type="text" />
          </div>

          <button class="btn btn-primary" id="btnSubmit" type="submit">Submit Payment</button>
        </form>

        <div id="msg" class="mt-3"></div>
      </div>
    `;

    document.getElementById('payForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('msg');
      const btn = document.getElementById('btnSubmit');

      msg.innerHTML = '';
      btn.disabled = true;
      btn.textContent = 'Submitting...';

      try {
        const proposal_id = document.getElementById('proposal_id').value;
        const method = document.getElementById('method').value;
        const amount = Number(document.getElementById('amount').value);
        const reference_no =
          document.getElementById('reference_no').value.trim();

        const result = await createPayment({
          proposal_id,
          method,
          amount,
          reference_no,
        });

        msg.innerHTML = `
          <div class="alert alert-success">
            Payment submitted.<br>
            Receipt No: <b>${result?.receipt?.receipt_no ?? 'N/A'}</b>
          </div>
        `;
      } catch (err) {
        msg.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Submit Payment';
      }
    });
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}

init();
