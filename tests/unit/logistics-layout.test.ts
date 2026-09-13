import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Smart Logistics Responsive Layout & Containment Suite', () => {
  const logisticsCssPath = path.resolve(process.cwd(), 'frontend/src/pages/seller/Logistics.css');
  const logisticsJsxPath = path.resolve(process.cwd(), 'frontend/src/pages/seller/Logistics.jsx');
  const appShellCssPath = path.resolve(process.cwd(), 'frontend/src/components/layout/AppShell.css');
  const animationsCssPath = path.resolve(process.cwd(), 'frontend/src/styles/animations.css');

  const logisticsCss = fs.readFileSync(logisticsCssPath, 'utf8');
  const logisticsJsx = fs.readFileSync(logisticsJsxPath, 'utf8');
  const appShellCss = fs.readFileSync(appShellCssPath, 'utf8');
  const animationsCss = fs.readFileSync(animationsCssPath, 'utf8');

  it('1. Parent layout containers declare min-width: 0 to prevent flex blowout', () => {
    expect(appShellCss).toMatch(/\.app-content\s*\{[^}]*min-width:\s*0/);
    expect(appShellCss).toMatch(/\.app-main\s*\{[^}]*min-width:\s*0/);
    expect(animationsCss).toMatch(/\.page-enter\s*\{[^}]*min-width:\s*0/);
    expect(animationsCss).toMatch(/\.page-enter\s*\{[^}]*width:\s*100%/);
  });

  it('2. Logistics page root enforces width: 100% and min-width: 0', () => {
    expect(logisticsCss).toMatch(/\.logistics-page\s*\{[^}]*width:\s*100%/);
    expect(logisticsCss).toMatch(/\.logistics-page\s*\{[^}]*min-width:\s*0/);
  });

  it('3. Header controls wrap and title block has min-width: 0 without pushing viewport', () => {
    expect(logisticsCss).toMatch(/\.logistics-header\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(logisticsCss).toMatch(/\.logistics-header-info\s*\{[^}]*min-width:\s*0/);
    expect(logisticsCss).toMatch(/\.logistics-header-controls\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it('4. Main grid uses flexible minmax columns that fit inside 1366px desktop width', () => {
    expect(logisticsCss).toMatch(/\.logistics-main-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.25fr\)\s*minmax\(320px,\s*1fr\)/);
    expect(logisticsCss).toMatch(/\.logistics-main-grid\s*\{[^}]*min-width:\s*0/);
  });

  it('5. Responsive breakpoint stacks Map and Route Details on narrower screens (<= 1100px)', () => {
    expect(logisticsCss).toMatch(/@media\s*\(\s*max-width:\s*1100px\s*\)\s*\{[\s\S]*?\.logistics-main-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
  });

  it('6. Leaflet map container maintains responsive width (100%) and safe desktop height', () => {
    expect(logisticsCss).toMatch(/\.logistics-map-card\s*\{[^}]*min-width:\s*0/);
    expect(logisticsCss).toMatch(/\.logistics-map-container\s*\{[^}]*width:\s*100%/);
    expect(logisticsCss).toMatch(/\.logistics-map-container\s*\{[^}]*min-width:\s*0/);
    // Desktop height preserved at >= 450px
    expect(logisticsCss).toMatch(/\.logistics-map-container\s*\{[^}]*height:\s*480px/);
  });

  it('7. Metric cards inside route panel use minmax(0, 1fr) to prevent overflow', () => {
    expect(logisticsCss).toMatch(/\.logistics-metrics-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    expect(logisticsCss).toMatch(/\.logistics-metric-card\s*\{[^}]*min-width:\s*0/);
    expect(logisticsCss).toMatch(/\.logistics-metric-label\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(logisticsCss).toMatch(/\.logistics-metric-value\s*\{[^}]*text-overflow:\s*ellipsis/);
  });

  it('8. Transparent cost breakdown allows long labels to word-break without blowing out container', () => {
    expect(logisticsCss).toMatch(/\.logistics-cost-row\s*\{[^}]*min-width:\s*0/);
    expect(logisticsCss).toMatch(/\.logistics-cost-label\s*\{[^}]*word-break:\s*break-word/);
    expect(logisticsCss).toMatch(/\.logistics-cost-val\s*\{[^}]*white-space:\s*nowrap/);
  });

  it('9. Economic comparison and route alternatives use fluid grids with responsive wrapping', () => {
    expect(logisticsCss).toMatch(/\.logistics-comparison-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto\s*minmax\(0,\s*1fr\)\s*auto\s*minmax\(0,\s*1\.2fr\)/);
    expect(logisticsCss).toMatch(/@media\s*\(\s*max-width:\s*900px\s*\)\s*\{[\s\S]*?\.logistics-comparison-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(logisticsCss).toMatch(/\.logistics-alternatives-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(240px,\s*1fr\)\)/);
  });

  it('10. Logistics.jsx registers container ResizeObserver to keep Leaflet synchronized with layout changes', () => {
    expect(logisticsJsx).toContain('ResizeObserver');
    expect(logisticsJsx).toContain('invalidateSize');
    expect(logisticsJsx).toContain("import './Logistics.css'");
  });

  it('11. Logistics.jsx does not use fixed desktop pixel widths that exceed 1366px container', () => {
    // Check that no fixed style width >= 800px exists in Logistics.jsx
    const fixedWidthMatches = logisticsJsx.match(/width:\s*['"](\d+)px['"]/g) || [];
    for (const match of fixedWidthMatches) {
      const px = parseInt(match.replace(/[^\d]/g, ''), 10);
      expect(px).toBeLessThan(400); // Only small badges/buttons/pins allowed to have fixed widths
    }
  });
});
