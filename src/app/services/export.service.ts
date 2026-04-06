import { Injectable } from '@angular/core';
import { Expense, ExpenseFilter } from '../models/models';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core'

interface ExportReportMeta {
  workspaceType?: 'personal' | 'business';
  workspaceLabel?: string;
  shopName?: string;
}

@Injectable({ providedIn: 'root' })
export class ExportService {

  async exportToPDF(
    expenses: Expense[],
    filter: ExpenseFilter & { datePresetLabel?: string; categoryNames?: string[] },
    userName: string,
    action: 'save' | 'share',
    meta?: ExportReportMeta
  ): Promise<void> {

    const errMsg = (e: any) =>
      (e && (e.message || e.reason || e.error || e.toString?.())) || 'Unknown error';

    let jsPDF: any;
    try {
      jsPDF = (await import('jspdf')).default;
      await import('jspdf-autotable');
    } catch (e) {
      throw new Error(`Failed to load PDF libraries: ${errMsg(e)}`);
    }

    let doc: any;
    try {
      doc = new jsPDF();
    } catch (e) {
      throw new Error(`Failed to initialize PDF: ${errMsg(e)}`);
    }

    const sortedExpenses = [...expenses].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // ===== HEADER =====
    doc.setFillColor(11, 58, 83);
    doc.rect(0, 0, 210, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Money Map Report', 14, 18);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated for: ${userName}`, 14, 26);
    doc.text(`Workspace: ${this.getWorkspaceSummary(meta)}`, 14, 30);
    doc.text(
      `Generated on: ${new Date().toLocaleDateString()}`,
      210 - 14,
      26,
      { align: 'right' }
    );

    // ===== SUMMARY BLOCK (Classic Dashboard Style) =====
    const total = sortedExpenses.reduce((s, e) => s + e.amount, 0);
    const average = sortedExpenses.length ? total / sortedExpenses.length : 0;

    // Background Panel
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 40, 182, 26, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, 40, 182, 26, 2, 2, 'S');

    // Dividers
    doc.setDrawColor(226, 232, 240);
    doc.line(74, 43, 74, 63);
    doc.line(134, 43, 134, 63);

    // Metric 1: Total
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL EXPENSES', 44, 50, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(this.formatCurrency(total), 44, 58, { align: 'center' });

    // Metric 2: Entries
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL ENTRIES', 104, 50, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(sortedExpenses.length.toString(), 104, 58, { align: 'center' });

    // Metric 3: Average
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.text('AVERAGE / ENTRY', 165, 50, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(this.formatCurrency(Math.round(average)), 165, 58, { align: 'center' });

    // Filters info slightly below the box
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text(`Active Filters: ${this.getFilterSummary(filter)}`, 14, 72);

    // ===== TABLE =====
    const rows = sortedExpenses.map(e => [
      new Date(e.date).toLocaleDateString(),
      e.title,
      e.categoryName || 'Uncategorized',
      this.formatCurrency(e.amount)
    ]);

    (doc as any).autoTable({
      head: [['Date', 'Title', 'Category', 'Amount']],
      body: rows,
      startY: 70,
      margin: { left: 14, right: 14 },
      theme: 'striped',
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      headStyles: {
        fillColor: [11, 58, 83],
        textColor: [255, 255, 255]
      },
      columnStyles: {
        3: { halign: 'right' }
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      }
    });

    // ===== CATEGORY BREAKDOWN =====
    const categoryTotals = this.getCategoryTotals(sortedExpenses);
    if (categoryTotals.length > 0) {
      let startY = ((doc as any).lastAutoTable?.finalY || 70) + 10;
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Category Breakdown', 14, startY);

      // --- VISUAL BAR CHART ---
      startY += 8;
      const maxAmount = Math.max(...categoryTotals.map(c => c.amount));
      const chartX = 14;
      const chartWidth = 182;
      const barHeight = 5;
      const gap = 5;
      const colors = [
        [15, 163, 177], [29, 78, 216], [236, 72, 153], [245, 158, 11], 
        [16, 185, 129], [139, 92, 246], [239, 68, 68], [107, 114, 128]
      ];

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');

      categoryTotals.forEach((item, index) => {
         // Check page break for chart
         if (startY > 270) {
           doc.addPage();
           startY = 20;
         }

         const barWidth = maxAmount > 0 ? (item.amount / maxAmount) * (chartWidth - 60) : 0; // space for labels
         
         // Category Label
         doc.setTextColor(71, 85, 105);
         let shortCategory = item.category.length > 15 ? item.category.substring(0, 15) + '...' : item.category;
         doc.text(shortCategory, chartX, startY + 3.5);
         
         // Bar
         const color = colors[index % colors.length];
         doc.setFillColor(color[0], color[1], color[2]);
         doc.roundedRect(chartX + 35, startY, barWidth > 2 ? barWidth : 2, barHeight, 1, 1, 'F');
         
         // Value Label
         doc.setTextColor(15, 23, 42);
         doc.text(this.formatCurrency(item.amount), chartX + 35 + barWidth + 3, startY + 3.5);
         
         startY += barHeight + gap;
      });

      startY += 5;

      // --- CATEGORY TABLE ---
      (doc as any).autoTable({
        head: [['Category', 'Amount', 'Share']],
        body: categoryTotals.map(item => [
          item.category,
          this.formatCurrency(item.amount),
          `${Math.round((item.amount / total) * 100)}%`
        ]),
        startY: startY,
        margin: { left: 14, right: 14 },
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [15, 163, 177], textColor: [255, 255, 255] },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
        alternateRowStyles: { fillColor: [248, 250, 252] }
      });
    }

    // ===== FOOTER =====
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.setDrawColor(230, 236, 242);
      doc.line(14, 285, 196, 285);
      doc.text(
        `Money Map | Page ${i} of ${pageCount}`,
        105,
        290,
        { align: 'center' }
      );
    }

    const fileName = `money-map-${this.getWorkspaceFilePart(meta)}-report-${new Date().toISOString().split('T')[0]}.pdf`;

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
    let pdfBase64 = '';
    try {
      const dataUri = doc.output('datauristring');
      pdfBase64 = (dataUri || '').split(',')[1] || '';
      if (!pdfBase64) {
        throw new Error('PDF base64 was empty');
      }
    } catch (e) {
      throw new Error(`Failed to encode PDF: ${errMsg(e)}`);
    }

    // Save file
    let savedFile: { uri: string };
    try {
      savedFile = await Filesystem.writeFile({
        path: fileName,
        data: pdfBase64,
        directory: action === 'save' ? Directory.Documents : Directory.Cache,
      });
    } catch (e1) {
      // Fallback for different Android versions/permissions
      try {
        savedFile = await Filesystem.writeFile({
          path: fileName,
          data: pdfBase64,
          directory: Directory.Cache,
        });
      } catch (e2) {
        throw new Error(`Failed to save PDF: ${errMsg(e1)} | ${errMsg(e2)}`);
      }
    }

    if (action === 'save') {
      // Just notify user it's saved to Documents
      return;
    }

    // Open Share Sheet
    try {
      await Share.share({
        title: `${this.getWorkspaceShareTitle(meta)} Expense Report`,
        text: `Here is your ${this.getWorkspaceShareTitle(meta).toLowerCase()} expense report.`,
        url: savedFile.uri,
        dialogTitle: 'Share Expense Report',
      });
    } catch (e) {
      throw new Error(`Failed to open share sheet: ${errMsg(e)} (uri=${savedFile?.uri || 'n/a'})`);
    }
  }

  private formatCurrency(amount: number): string {
    return `PKR ${Math.round(amount).toLocaleString()}`;
  }

  private getFilterSummary(filter: ExpenseFilter & { datePresetLabel?: string; categoryNames?: string[] }): string {
    const parts: string[] = [];

    if (filter.datePresetLabel && filter.datePresetLabel !== 'All Time') {
      parts.push(filter.datePresetLabel);
    } else {
      if (filter.startDate) parts.push(`From ${new Date(filter.startDate).toLocaleDateString()}`);
      if (filter.endDate) parts.push(`To ${new Date(filter.endDate).toLocaleDateString()}`);
    }

    if (filter.categoryNames && filter.categoryNames.length > 0) {
      parts.push(
        filter.categoryNames.length <= 2
          ? `Categories: ${filter.categoryNames.join(', ')}`
          : `${filter.categoryNames.length} Categories`
      );
    }

    return parts.length ? parts.join(' | ') : 'All Time';
  }

  private getCategoryTotals(expenses: Expense[]): Array<{ category: string; amount: number }> {
    const totals = new Map<string, number>();
    expenses.forEach(expense => {
      const key = expense.categoryName || 'Uncategorized';
      totals.set(key, (totals.get(key) || 0) + expense.amount);
    });
    return Array.from(totals.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }

  private getWorkspaceSummary(meta?: ExportReportMeta): string {
    if (meta?.workspaceType === 'business') {
      return `Business${meta.shopName ? ` - ${meta.shopName}` : ''}`;
    }
    return meta?.workspaceLabel || 'Personal';
  }

  private getWorkspaceFilePart(meta?: ExportReportMeta): string {
    if (meta?.workspaceType === 'business') {
      const shop = (meta.shopName || 'shop')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return `business-${shop || 'shop'}`;
    }
    return 'personal';
  }

  private getWorkspaceShareTitle(meta?: ExportReportMeta): string {
    return meta?.workspaceType === 'business' ? 'Business' : 'Personal';
  }
}
