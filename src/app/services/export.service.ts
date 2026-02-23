import { Injectable } from '@angular/core';
import { Expense, ExpenseFilter } from '../models/models';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core'

@Injectable({ providedIn: 'root' })
export class ExportService {

 async exportToPDF(expenses: any[], filter: any, userName: string): Promise<void> {

    const jsPDF = (await import('jspdf')).default;
    await import('jspdf-autotable');

    const doc = new jsPDF();

    // ===== HEADER =====
    doc.setFillColor(102, 126, 234);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Expense Report', 14, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated for: ${userName}`, 14, 29);
    doc.text(
      `Date: ${new Date().toLocaleDateString()}`,
      210 - 14,
      29,
      { align: 'right' }
    );

    // ===== SUMMARY =====
    const total = expenses.reduce((s, e) => s + e.amount, 0);

    doc.setFillColor(240, 244, 248);
    doc.roundedRect(14, 43, 182, 22, 3, 3, 'F');

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Total Expenses: PKR ${total.toLocaleString()}`,
      105,
      51,
      { align: 'center' }
    );

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${expenses.length} transaction(s)`,
      105,
      58,
      { align: 'center' }
    );

    // ===== TABLE =====
    const rows = expenses.map(e => [
      new Date(e.date).toLocaleDateString(),
      e.title,
      e.categoryName || 'Uncategorized',
      e.notes || '-',
      `PKR ${e.amount.toLocaleString()}`
    ]);

    (doc as any).autoTable({
      head: [['Date', 'Title', 'Category', 'Notes', 'Amount']],
      body: rows,
      startY: 70,
      margin: { left: 14, right: 14 }
    });

    // ===== FOOTER =====
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Page ${i} of ${pageCount} — Expense Tracker`,
        105,
        290,
        { align: 'center' }
      );
    }

    const fileName = `expense-report-${new Date().toISOString().split('T')[0]}.pdf`;

    // ===============================
    // PLATFORM CHECK
    // ===============================

    if (Capacitor.getPlatform() === 'web') {
      // Browser download
      doc.save(fileName);
      return;
    }

    // ===== ANDROID / IOS =====

    // Convert PDF to base64
    const pdfBase64 = doc.output('datauristring').split(',')[1];

    // Save file
    const savedFile = await Filesystem.writeFile({
      path: fileName,
      data: pdfBase64,
      directory: Directory.Documents,
    });

    // Open Share Sheet (Best UX)
    await Share.share({
      title: 'Expense Report',
      text: 'Here is your expense report.',
      url: savedFile.uri,
    });

  }
}
