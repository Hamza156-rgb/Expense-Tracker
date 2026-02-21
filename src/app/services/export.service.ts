import { Injectable } from '@angular/core';
import { Expense, ExpenseFilter } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ExportService {

  async exportToPDF(expenses: Expense[], filter: ExpenseFilter, userName: string): Promise<void> {
    // Dynamic import to reduce bundle size
    const jsPDF = (await import('jspdf')).default;
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF();

    // Header
    doc.setFillColor(102, 126, 234);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Expense Report', 14, 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated for: ${userName}`, 14, 29);
    doc.text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 210 - 14, 29, { align: 'right' });

    // Filter info
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(9);
    let filterY = 43;
    if (filter.startDate || filter.endDate) {
      const from = filter.startDate ? new Date(filter.startDate).toLocaleDateString() : 'All time';
      const to = filter.endDate ? new Date(filter.endDate).toLocaleDateString() : 'Present';
      doc.text(`Period: ${from} — ${to}`, 14, filterY);
      filterY += 6;
    }

    // Summary box
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    doc.setFillColor(240, 244, 248);
    doc.roundedRect(14, filterY, 182, 22, 3, 3, 'F');
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Expenses: PKR ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 105, filterY + 8, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`${expenses.length} transaction(s)`, 105, filterY + 15, { align: 'center' });

    // Table
    const tableRows = expenses.map(e => [
      new Date(e.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      e.title,
      e.categoryName || 'Uncategorized',
      e.notes || '—',
      `PKR ${Number(e.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    ]);

    (doc as any).autoTable({
      head: [['Date', 'Title', 'Category', 'Notes', 'Amount']],
      body: tableRows,
      startY: filterY + 28,
      headStyles: {
        fillColor: [102, 126, 234],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10
      },
      bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 50 },
        2: { cellWidth: 38 },
        3: { cellWidth: 40 },
        4: { cellWidth: 30, halign: 'right' }
      },
      margin: { left: 14, right: 14 }
    });

    // Category breakdown
    const lastY = (doc as any).lastAutoTable.finalY + 15;
    const byCat: { [key: string]: number } = {};
    expenses.forEach(e => {
      byCat[e.categoryName || 'Other'] = (byCat[e.categoryName || 'Other'] || 0) + e.amount;
    });

    if (Object.keys(byCat).length > 0 && lastY < 250) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Category Breakdown', 14, lastY);

      const breakdownRows = Object.entries(byCat)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => [
          cat,
          `PKR ${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          `${((amt / total) * 100).toFixed(1)}%`
        ]);

      (doc as any).autoTable({
        head: [['Category', 'Amount', 'Percentage']],
        body: breakdownRows,
        startY: lastY + 5,
        headStyles: { fillColor: [118, 75, 162], textColor: 255, fontStyle: 'bold', fontSize: 10 },
        bodyStyles: { fontSize: 9 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 14, right: 14 },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'right' }
        }
      });
    }

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Page ${i} of ${pageCount} — Expense Tracker App`, 105, 290, { align: 'center' });
    }

    doc.save(`expense-report-${new Date().toISOString().split('T')[0]}.pdf`);
  }
}
