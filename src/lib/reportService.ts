
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Customer, Transaction, ShopSettings } from '../types';

export const generateCustomerPDF = (
  customer: Customer, 
  transactions: Transaction[], 
  settings: ShopSettings
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  // Header - App Name
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129); // emerald-600
  doc.text('Dukan Pro', 14, 20);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text('Account statement', pageWidth - 14, 15, { align: 'right' });
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, pageWidth - 14, 21, { align: 'right' });

  // Shop Details
  doc.setFontSize(16);
  doc.setTextColor(30);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.name, 14, 35);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Phone: ${settings.phone}`, 14, 42);

  // Line
  doc.setDrawColor(220);
  doc.setLineWidth(0.5);
  doc.line(14, 48, pageWidth - 14, 48);

  // Customer Section
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text('Customer name:', 14, 60);
  doc.setTextColor(30);
  doc.setFont('helvetica', 'bold');
  doc.text(customer.name, 50, 60);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text('Phone number:', 14, 68);
  doc.setTextColor(30);
  doc.text(customer.phone, 50, 68);

  // Summary Card
  const ySummary = 85;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', 14, ySummary);

  const givenArray = ['credit_given', 'sale', 'credit'];
  const takenArray = ['payment_received', 'payment'];

  const totalGiven = transactions
    .filter(t => givenArray.includes(t.type))
    .reduce((sum, t) => sum + t.amount, 0);
  const totalTaken = transactions
    .filter(t => takenArray.includes(t.type))
    .reduce((sum, t) => sum + t.amount, 0);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Total given to ${customer.name}:`, 14, ySummary + 10);
  doc.setTextColor(30);
  doc.text(`Rs. ${totalGiven.toLocaleString()}`, 80, ySummary + 10);

  doc.setTextColor(100);
  doc.text(`Total taken from ${customer.name}:`, 14, ySummary + 18);
  doc.setTextColor(30);
  doc.text(`Rs. ${totalTaken.toLocaleString()}`, 80, ySummary + 18);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100);
  doc.text('Net balance:', 14, ySummary + 28);
  // PDF report colors: amber-600 for positive, emerald-600 for negative
  doc.setTextColor(customer.balance > 0 ? 245 : 16, customer.balance > 0 ? 158 : 185, customer.balance > 0 ? 11 : 129); // amber-600 or emerald-600
  const balanceLabel = customer.balance > 0 ? '(Lene hain / Receivable)' : customer.balance < 0 ? '(Dene hain / Payable)' : '';
  doc.text(`Rs. ${Math.abs(customer.balance).toLocaleString()} ${balanceLabel}`, 80, ySummary + 28);

  // Transactions Table
  // Sort transactions by date ascending for balance calculation
  const sortedTransactions = [...transactions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  
  let currentBalance = 0;
  const balanceMap = new Map();
  sortedTransactions.forEach(t => {
    const isGiven = givenArray.includes(t.type);
    currentBalance += isGiven ? t.amount : -t.amount;
    balanceMap.set(t.id, currentBalance);
  });

  // Now map to table data (usually descending for reports)
  const tableData = [...transactions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(t => {
      const dateStr = new Date(t.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const isGiven = givenArray.includes(t.type);
      
      return [
        `${dateStr}\n${timeStr}`,
        t.description || (isGiven ? 'Given / Udhar' : 'Taken / Vasuli'),
        isGiven ? `+ ${t.amount}` : `- ${t.amount}`,
        `Rs. ${balanceMap.get(t.id).toLocaleString()}`
      ];
    });

  autoTable(doc, {
    startY: ySummary + 40,
    head: [['Date & time', 'Description', 'Amount (Rs.)', 'Balance (Rs.)']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: [71, 85, 105],
      fontSize: 10,
      fontStyle: 'bold',
      halign: 'left'
    },
    styles: {
      fontSize: 9,
      cellPadding: 4
    },
    columnStyles: {
      2: { halign: 'right', fontStyle: 'bold' },
      3: { halign: 'right', fontStyle: 'bold' }
    }
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });
    doc.text('Powered by Dukan Pro', 14, doc.internal.pageSize.height - 10);
  }

  doc.save(`${customer.name}_Report.pdf`);
};

export const shareOnWhatsApp = (customer: Customer, transactions: Transaction[], settings: ShopSettings) => {
    // Generate a summary and last 5 transactions for WhatsApp
    const latestTx = [...transactions]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);

    let message = `*Statement: ${customer.name}*\n`;
    message += `Shop: *${settings.name}*\n`;
    message += `------------------------\n`;
    message += `*Current Balance: Rs. ${Math.abs(customer.balance).toLocaleString()}*\n`;
    message += `${customer.balance > 0 ? 'Maine lene hain (Receivable)' : customer.balance < 0 ? 'Maine dene hain (Payable)' : 'Settle'}\n\n`;
    
    if (latestTx.length > 0) {
        message += `*Latest Transactions:*\n`;
        latestTx.forEach(t => {
            const date = new Date(t.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            const isGiven = ['credit_given', 'sale', 'credit'].includes(t.type);
            message += `• ${date}: ${isGiven ? '+' : '-'} Rs. ${t.amount} (${t.description || (isGiven ? 'Given' : 'Taken')})\n`;
        });
    }

    message += `\n_Generated via Dukan Pro_`;
    
    const url = `https://wa.me/92${customer.phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
};
