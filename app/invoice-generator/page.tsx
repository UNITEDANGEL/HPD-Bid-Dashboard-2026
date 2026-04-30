"use client";

import { useMemo, useState } from "react";

type LineItem = {
  description: string;
  quantity: number;
  rate: number;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

export default function InvoiceGeneratorPage() {
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${new Date().toISOString().slice(0,10).replaceAll("-", "")}`);
  const [customer, setCustomer] = useState("NYC HPD / Property Owner");
  const [jobId, setJobId] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("Generated from HPD Bid Management dashboard.");
  const [taxRate, setTaxRate] = useState(0);
  const [items, setItems] = useState<LineItem[]>([
    { description: "Labor and materials", quantity: 1, rate: 0 },
  ]);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0), 0), [items]);
  const tax = subtotal * (Number(taxRate || 0) / 100);
  const total = subtotal + tax;

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  function addItem() {
    setItems((current) => [...current, { description: "", quantity: 1, rate: 0 }]);
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  function printInvoice() {
    window.print();
  }

  return (
    <main className="command-shell">
      <section className="command-hero invoice-print-header">
        <div>
          <p className="eyebrow">Invoice Generator</p>
          <h1>Create invoice draft</h1>
          <p className="hero-copy">Build an invoice from job details, line items, tax, notes, and print/save to PDF.</p>
        </div>
        <div className="hero-actions no-print">
          <button className="primary-link button-like" onClick={printInvoice}>Print / Save PDF</button>
        </div>
      </section>

      <section className="invoice-grid">
        <div className="invoice-form no-print">
          <label>Invoice #<input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} /></label>
          <label>Customer<input value={customer} onChange={(e) => setCustomer(e.target.value)} /></label>
          <label>Job ID<input value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="EQ / EP / OMO" /></label>
          <label>Job Address<input value={address} onChange={(e) => setAddress(e.target.value)} /></label>
          <label>Tax %<input type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} /></label>
          <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <button className="secondary-link button-like" onClick={addItem}>Add line item</button>
        </div>

        <div className="invoice-preview">
          <div className="invoice-title-row">
            <div>
              <p className="eyebrow">United Angel Construction Corp.</p>
              <h2>Invoice</h2>
            </div>
            <strong>{invoiceNumber}</strong>
          </div>

          <div className="invoice-two-col">
            <div><strong>Bill To</strong><p>{customer}</p><p>{address || "No address entered"}</p></div>
            <div><strong>Job</strong><p>{jobId || "No job ID entered"}</p><p>{new Date().toLocaleDateString()}</p></div>
          </div>

          <div className="invoice-table">
            <div className="invoice-row invoice-head"><span>Description</span><span>Qty</span><span>Rate</span><span>Total</span><span className="no-print">Action</span></div>
            {items.map((item, index) => (
              <div className="invoice-row" key={index}>
                <input value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} />
                <input type="number" value={item.quantity} onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })} />
                <input type="number" value={item.rate} onChange={(e) => updateItem(index, { rate: Number(e.target.value) })} />
                <strong>{money(Number(item.quantity || 0) * Number(item.rate || 0))}</strong>
                <button className="ghost-button no-print" onClick={() => removeItem(index)}>Remove</button>
              </div>
            ))}
          </div>

          <div className="invoice-totals">
            <p><span>Subtotal</span><strong>{money(subtotal)}</strong></p>
            <p><span>Tax</span><strong>{money(tax)}</strong></p>
            <p className="grand"><span>Total</span><strong>{money(total)}</strong></p>
          </div>

          <div className="description-card"><strong>Notes</strong><p>{notes}</p></div>
        </div>
      </section>
    </main>
  );
}
