import { api, getScoreColor } from '../main.js';
import jsPDF from 'jspdf';
import { t } from '../i18n.js';
import { sanitizeHTML, escapeHTML } from '../sanitize.js';

let reportMarkdown = '';
let reportScore = 0;
let reportLevel = 1;
let reportGaps = [];
let reportStrengths = [];

export async function renderReport(container) {
  const assessmentsStr = localStorage.getItem('oaimm_assessments');
  const assessments = assessmentsStr ? JSON.parse(assessmentsStr) : {};

  if (Object.keys(assessments).length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">${t('report.noAssessment')}</div>
        <a href="#assessment" class="btn btn-primary">${t('report.goToAssessment')}</a>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="loading-overlay">
      <div class="spinner"></div>
      <span style="margin-left: 10px;">${t('report.generatingAi')}</span>
    </div>
  `;
  
  try {
    // Try to get scores from checklist history first, then dashboard
    let overallScore = 0;
    let overallLevel = 1;
    let gaps = [];
    let strengths = [];

    try {
      const historyRes = await api.get('/checklist/history');
      if (historyRes && historyRes.length > 0) {
        const latest = historyRes[0];
        overallScore = latest.overall_score || 0;
        overallLevel = latest.overall_level || 1;
        gaps = latest.gaps || [];
        strengths = latest.strengths || [];
      }
    } catch {
      // Fallback — compute from localStorage
      try {
        const model = await api.get('/checklist/model');
        if (model?.dimensions) {
          let totalScore = 0, totalWeight = 0;
          model.dimensions.forEach(dim => {
            const fulfilled = dim.checkpoints.filter(cp => assessments[cp.id]?.fulfilled).length;
            const total = dim.checkpoints.length;
            const score = total > 0 ? (fulfilled / total * 100) : 0;
            totalScore += score * dim.weight;
            totalWeight += dim.weight;
            if (score < 40) gaps.push(t('report.checkpointsUnmet').replace('{dim}', dim.name).replace('{unmet}', total - fulfilled).replace('{total}', total));
            if (score >= 70) strengths.push(t('report.checkpointsMet').replace('{dim}', dim.name).replace('{met}', fulfilled).replace('{total}', total).replace('{score}', Math.round(score)));
          });
          overallScore = totalWeight > 0 ? totalScore / totalWeight : 0;
          if (overallScore >= 90) overallLevel = 5;
          else if (overallScore >= 70) overallLevel = 4;
          else if (overallScore >= 50) overallLevel = 3;
          else if (overallScore >= 25) overallLevel = 2;
        }
      } catch {}
    }

    reportScore = overallScore;
    reportLevel = overallLevel;
    reportGaps = gaps;
    reportStrengths = strengths;

    const payload = {
      score_data: {
        overall_score: overallScore,
        overall_level: overallLevel,
        gaps: gaps,
        strengths: strengths
      }
    };

    const briefingRes = await fetch('/api/export/executive-briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!briefingRes.ok) throw new Error(t('report.briefingFailed'));
    
    const briefingData = await briefingRes.json();
    reportMarkdown = briefingData.markdown || '';
    
    // Parse Markdown
    let html = reportMarkdown
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/\n\n/g, '<br><br>')
          .replace(/\n/g, '<br>')
          .replace(/^### (.*$)/gim, '<h4 style="margin-top:1.2em; margin-bottom:0.3em; font-weight:700; color: #111;">$1</h4>')
          .replace(/^## (.*$)/gim, '<h3 style="margin-top:1.5em; margin-bottom:0.5em; font-weight:800; color: #1e40af; border-bottom: 1px solid #ddd; padding-bottom: 4px;">$1</h3>')
          .replace(/^# (.*$)/gim, '<h2 style="font-size:1.5em; color: #111;">$1</h2>');
          
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const scoreColor = getScoreColor(overallScore);

    container.innerHTML = `
      <div id="report-content" style="background: white; color: #111; border-radius: 12px; overflow: hidden;">
        
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #0c1021 100%); padding: 32px 40px; color: white;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,255,255,0.6); margin-bottom: 4px;">${t('report.headerSub')}</div>
              <div style="font-size: 1.6rem; font-weight: 800;">${t('report.headerTitle')}</div>
              <div style="color: rgba(255,255,255,0.5); margin-top: 4px; font-size: 0.85rem;">${t('report.generatedOn').replace('{date}', dateStr)}</div>
            </div>
            <div style="text-align: center; background: rgba(255,255,255,0.1); padding: 16px 28px; border-radius: 12px; backdrop-filter: blur(10px);">
              <div style="font-size: 2.2rem; font-weight: 800;">${overallScore.toFixed(0)}</div>
              <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.7);">${t('report.scoreLabel').replace('{level}', overallLevel)}</div>
            </div>
          </div>
        </div>
        
        <div style="padding: 32px 40px;">
          <div id="report-narrative" style="font-size: 0.95rem; line-height: 1.7; color: #333;">
            ${html}
          </div>
          
          <div style="margin-top: 3rem; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 1rem; color: #9ca3af; font-size: 0.8em;">
            ${t('report.footer')}
          </div>
        </div>
      </div>
      
      <div style="margin-top: 1.5rem; display: flex; gap: 1rem; justify-content: center;">
        <button class="btn btn-primary" id="btn-download-pdf" style="font-weight: bold; font-size: 1rem; padding: 12px 28px; background: var(--gradient-primary); border: none; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);">${t('report.downloadPdf')}</button>
        <button class="btn btn-secondary" onclick="window.print()" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 12px 20px;">${t('report.printBtn')}</button>
        <button class="btn btn-secondary" onclick="window.location.hash='dashboard'" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 12px 20px;">${t('report.backBtn')}</button>
      </div>
    `;

    document.getElementById('btn-download-pdf')?.addEventListener('click', generatePDF);

  } catch (err) {
    container.innerHTML = `<div class="empty-state">${t('report.failedLoad').replace('{msg}', err.message)}</div>`;
  }
}

async function generatePDF() {
  const btn = document.getElementById('btn-download-pdf');
  if (btn) { btn.disabled = true; btn.textContent = t('report.generatingPdf'); }

  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let y = 0;

    // === Header Banner ===
    doc.setFillColor(30, 58, 95);
    doc.rect(0, 0, pageWidth, 45, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text(t('report.headerSub').toUpperCase(), margin, 14);
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text(t('report.headerTitle'), margin, 25);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(180, 200, 220);
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(t('report.generatedOn').replace('{date}', dateStr), margin, 33);

    // Score badge
    doc.setFillColor(255, 255, 255, 0.15);
    const badgeX = pageWidth - margin - 35;
    doc.roundedRect(badgeX, 10, 35, 25, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont(undefined, 'bold');
    doc.text(`${reportScore.toFixed(0)}`, badgeX + 17.5, 23, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.text(t('report.scoreLabel').replace('{level}', reportLevel), badgeX + 17.5, 30, { align: 'center' });

    y = 55;

    // === Body Text ===
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');

    // Clean markdown for PDF
    const cleanText = reportMarkdown
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^#{1,4}\s*(.*$)/gim, '\n$1\n')
      .replace(/\n{3,}/g, '\n\n');

    const lines = doc.splitTextToSize(cleanText, contentWidth);

    for (const line of lines) {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }

      // Detect heading-like lines (uppercase or short with colon)
      const trimmed = line.trim();
      if (trimmed.length > 0 && trimmed.length < 60 && (trimmed === trimmed.toUpperCase() || /^[A-Z]/.test(trimmed) && !trimmed.includes(' is ') && !trimmed.includes(' the '))) {
        if (trimmed.length < 45) {
          doc.setFont(undefined, 'bold');
          doc.setFontSize(11);
          doc.setTextColor(30, 64, 175);
          y += 3;
        }
      }

      doc.text(trimmed, margin, y);
      y += 5;

      // Reset font after heading
      doc.setFont(undefined, 'normal');
      doc.setFontSize(10);
      doc.setTextColor(50, 50, 50);
    }

    // === Footer ===
    y += 10;
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(t('report.footer'), pageWidth / 2, y, { align: 'center' });

    // Save
    doc.save(`AI_Strategy_Hub_Executive_Briefing_${new Date().toISOString().split('T')[0]}.pdf`);

  } catch (e) {
    alert(t('report.pdfFailed').replace('{msg}', e.message));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t('report.downloadPdf'); }
  }
}
