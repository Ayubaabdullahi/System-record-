// app.js - modular Firebase v12 compatible (patched)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, getDocs, orderBy, query, limit,
  runTransaction, serverTimestamp, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// === CONFIG (na Ayuba) ===
const firebaseConfig = {
  apiKey: "AIzaSyDm35w4edp811CsLhyiUSUqlkEt69_BWYU",
  authDomain: "loginsysterm.firebaseapp.com",
  projectId: "loginsysterm",
  storageBucket: "loginsysterm.firebasestorage.app",
  messagingSenderId: "181422276481",
  appId: "1:181422276481:web:0a74d8a68c2446a4673280",
  measurementId: "G-H4SYPENMZT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM elements (ensure these IDs exist in your HTML)
const statusEl = document.getElementById('status');
const btnCreateSample = document.getElementById('btn-create-sample');
const invoicesContainer = document.getElementById('invoices-container');
const paymentForm = document.getElementById('payment-form');
const paymentResult = document.getElementById('payment-result');
const paymentsContainer = document.getElementById('payments-container');
const receiptArea = document.getElementById('receipt-area');
const receiptDiv = document.getElementById('receipt');
const printReceiptBtn = document.getElementById('print-receipt');

if(statusEl) statusEl.textContent = "Firebase connected (modular)";

// === Utility functions ===
function formatNairaFromKobo(kobo) {
  if(kobo == null) return '₦0';
  return '₦' + (kobo / 100).toLocaleString();
}
function nairaToKobo(naira) {
  return Math.round(parseFloat(naira || 0) * 100);
}

// === Create sample invoice ===
if(btnCreateSample){
  btnCreateSample.addEventListener('click', async () => {
    try {
      const invoiceRef = doc(collection(db, 'invoices'));
      const data = {
        invoiceId: invoiceRef.id,
        studentId: 'STU0001',
        studentName: 'Ayuba Abdullahi',
        term: 'First',
        issueDate: new Date().toISOString(),
        total_amount_kobo: nairaToKobo(200000),
        amount_paid_kobo: 0,
        balance_kobo: nairaToKobo(200000),
        status: 'Not Paid',
        createdAt: serverTimestamp()
      };
      await setDoc(invoiceRef, data);
      alert('Sample invoice created successfully!');
      loadInvoices();
    } catch (err) {
      console.error(err);
      alert('Error creating sample: ' + err.message);
    }
  });
}

// === Load invoices ===
async function loadInvoices() {
  if(!invoicesContainer) return;
  invoicesContainer.innerHTML = 'Loading...';
  try{
    const q = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    if (snap.empty) {
      invoicesContainer.innerHTML = '<i>No invoices yet</i>';
      return;
    }
    let html = '<table><tr><th>Student</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr>';
    snap.forEach(docSnap => {
      const d = docSnap.data();
      const cls = d.status === 'Paid' ? 'status-paid' : (d.status === 'Part Paid' ? 'status-part' : 'status-not');
      html += `<tr>
        <td>${d.studentName || d.studentId || ''}</td>
        <td>${formatNairaFromKobo(d.total_amount_kobo)}</td>
        <td>${formatNairaFromKobo(d.amount_paid_kobo)}</td>
        <td>${formatNairaFromKobo(d.balance_kobo)}</td>
        <td class="${cls}">${d.status}</td>
      </tr>`;
    });
    html += '</table>';
    invoicesContainer.innerHTML = html;
  }catch(e){
    console.error(e);
    invoicesContainer.innerHTML = '<div style="color:#ef4444">Unable to load invoices</div>';
  }
}

// === Load payments ===
async function loadPayments() {
  if(!paymentsContainer) return;
  paymentsContainer.innerHTML = 'Loading...';
  try{
    const q = query(collection(db, 'payments'), orderBy('timestamp', 'desc'), limit(20));
    const snap = await getDocs(q);
    if (snap.empty) {
      paymentsContainer.innerHTML = '<i>No payments yet</i>';
      return;
    }
    let html = '<table><tr><th>Student</th><th>Invoice</th><th>Amount</th><th>Method</th><th>Date</th></tr>';
    snap.forEach(p => {
      const d = p.data();
      const dt = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleString() : (d.timestamp || '');
      html += `<tr>
        <td>${d.studentId || ''}</td>
        <td>${d.invoiceId || ''}</td>
        <td>${formatNairaFromKobo(d.amount_kobo || 0)}</td>
        <td>${d.method || ''}</td>
        <td>${dt}</td>
      </tr>`;
    });
    html += '</table>';
    paymentsContainer.innerHTML = html;
  }catch(e){
    console.error(e);
    paymentsContainer.innerHTML = '<div style="color:#ef4444">Unable to load payments</div>';
  }
}

// === Record Payment (with transaction) ===
if(paymentForm){
  paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(paymentResult) paymentResult.textContent = 'Processing...';

    const studentId = document.getElementById('studentId')?.value?.trim();
    const invoiceId = document.getElementById('invoiceId')?.value?.trim();
    const amount = parseFloat(document.getElementById('amount')?.value);
    const method = document.getElementById('method')?.value;
    const reference = document.getElementById('reference')?.value?.trim();
    const paidBy = document.getElementById('paidBy')?.value?.trim();

    if(!studentId || !invoiceId || !amount || isNaN(amount)){
      if(paymentResult) paymentResult.textContent = 'Enter valid student, invoice and amount';
      return;
    }

    const amountKobo = nairaToKobo(amount);

    try {
      await runTransaction(db, async (tx) => {
        const invoiceRef = doc(db, 'invoices', invoiceId);
        const invoiceSnap = await tx.get(invoiceRef);
        if (!invoiceSnap.exists()) throw new Error('Invoice not found!');
        const inv = invoiceSnap.data();

        const prevPaid = Number(inv.amount_paid_kobo || 0);
        const newPaid = prevPaid + amountKobo;
        const newBalance = Number(inv.total_amount_kobo || 0) - newPaid;
        const newStatus = newBalance <= 0 ? 'Paid' : 'Part Paid';

        // create payment
        const paymentRef = doc(collection(db, 'payments'));
        tx.set(paymentRef, {
          paymentId: paymentRef.id,
          studentId,
          invoiceId,
          amount_kobo: amountKobo,
          method,
          reference,
          paidBy,
          timestamp: serverTimestamp()
        });

        // update invoice
        tx.update(invoiceRef, {
          amount_paid_kobo: newPaid,
          balance_kobo: newBalance,
          status: newStatus,
          updatedAt: serverTimestamp()
        });
      });

      if(paymentResult) paymentResult.textContent = 'Payment recorded successfully!';
      await loadInvoices();
      await loadPayments();
    } catch (err) {
      console.error(err);
      if(paymentResult) paymentResult.textContent = 'Error: ' + err.message;
    }
  });
}

// === Initial loads ===
loadInvoices();
loadPayments();

if(printReceiptBtn){
  printReceiptBtn.addEventListener('click', () => window.print());
}