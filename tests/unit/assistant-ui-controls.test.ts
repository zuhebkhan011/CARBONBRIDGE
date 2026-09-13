import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('CarbonBridge Assistant UI Controls & Onboarding Layout Fix', () => {
  const jsxPath = path.resolve(process.cwd(), 'frontend/src/components/assistant/CarbonBridgeAssistant.jsx');
  const cssPath = path.resolve(process.cwd(), 'frontend/src/components/assistant/CarbonBridgeAssistant.css');

  const jsxContent = fs.readFileSync(jsxPath, 'utf-8');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');

  describe('1. Minimize / Maximize / Close Controls & Accessible Labels', () => {
    it('contains three distinct header action controls with exact accessible labels', () => {
      expect(jsxContent).toContain('aria-label="Minimize assistant"');
      expect(jsxContent).toContain('aria-label="Maximize assistant"');
      expect(jsxContent).toContain('aria-label="Close assistant"');
    });

    it('renders the appropriate familiar icons for Minimize, Maximize, and Close', () => {
      // Minimize icon has minus line
      expect(jsxContent).toContain('<line x1="5" y1="12" x2="19" y2="12" />');
      // Maximize icon has ⛶ expand path
      expect(jsxContent).toContain('path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"');
      // Close icon has × cross lines
      expect(jsxContent).toContain('<line x1="18" y1="6" x2="6" y2="18" />');
    });

    it('has isMaximized state and toggles it on clicking Maximize control', () => {
      expect(jsxContent).toContain('const [isMaximized, setIsMaximized] = useState(false);');
      expect(jsxContent).toContain('setIsMaximized(!isMaximized)');
    });
  });

  describe('2. Minimize Behavior', () => {
    it('reduces panel to compact state without closing assistant', () => {
      expect(jsxContent).toContain("${isMinimized ? 'minimized' : ''}");
      expect(cssContent).toContain('.cb-assistant-panel.minimized');
      expect(cssContent).toMatch(/\.cb-assistant-panel\.minimized\s*\{[^}]*height:\s*auto;/);
    });

    it('allows user to restore assistant when minimized', () => {
      expect(jsxContent).toContain('isMinimized ? () => setIsMinimized(false) : undefined');
      expect(jsxContent).toContain('setIsMinimized(!isMinimized)');
    });
  });

  describe('3. Maximize Behavior', () => {
    it('expands assistant to larger intended view inside viewport', () => {
      expect(jsxContent).toContain("${isMaximized ? 'maximized' : ''}");
      expect(cssContent).toContain('.cb-assistant-panel.maximized');
      expect(cssContent).toMatch(/\.cb-assistant-panel\.maximized\s*\{[^}]*width:\s*780px;/);
      expect(cssContent).toMatch(/\.cb-assistant-panel\.maximized\s*\{[^}]*height:\s*calc\(100vh - 48px\);/);
      expect(cssContent).toMatch(/\.cb-assistant-panel\.maximized\s*\{[^}]*max-height:\s*calc\(100vh - 48px\);/);
    });

    it('keeps header, scrollable body, and input/mic accessible', () => {
      expect(cssContent).toMatch(/\.cb-assistant-header\s*\{[^}]*flex-shrink:\s*0;/);
      expect(cssContent).toMatch(/\.cb-assistant-body\s*\{[^}]*overflow-y:\s*auto;/);
    });
  });

  describe('4 & 5. Onboarding Layout & Root Cause Clipping Fix', () => {
    it('wraps onboarding card, quick chips, and messages inside dedicated cb-assistant-body', () => {
      expect(jsxContent).toContain('<div className="cb-assistant-body" ref={chatBodyRef}>');
      expect(cssContent).toContain('.cb-assistant-body');
      expect(cssContent).toMatch(/\.cb-assistant-body\s*\{[^}]*min-height:\s*0;/);
      expect(cssContent).toMatch(/\.cb-assistant-body\s*\{[^}]*flex:\s*1/);
    });

    it('prevents unconditional scrollIntoView that scrolled the panel container and clipped onboarding', () => {
      // Must not do messagesEndRef.current?.scrollIntoView() on load
      expect(jsxContent).not.toMatch(/messagesEndRef\.current\?\.scrollIntoView\(\s*\{\s*behavior:\s*'smooth'\s*\}\s*\)/);
    });

    it('explicitly keeps scrollTop = 0 when opened with onboarding to ensure onboarding card is fully visible', () => {
      expect(jsxContent).toContain('if (showOnboarding && messages.length <= 1)');
      expect(jsxContent).toContain('chatBodyRef.current.scrollTop = 0');
      expect(jsxContent).toContain('panelRef.current.scrollTop = 0');
    });

    it('does not use arbitrary negative margins or pixel offset workarounds', () => {
      expect(cssContent).not.toMatch(/margin-top:\s*-\d+px/);
      expect(cssContent).not.toMatch(/top:\s*-\d+px/);
    });
  });

  describe('6. Dismiss Behavior', () => {
    it('only dismisses onboarding without altering assistant dimensions', () => {
      expect(jsxContent).toContain('handleDismissOnboarding');
      expect(jsxContent).toContain('setShowOnboarding(false)');
      expect(jsxContent).toContain("localStorage.setItem(dismissalKey, 'true')");
    });
  });

  describe('7 & 8. Responsive Design Verification', () => {
    it('has media queries protecting tablet and mobile viewports', () => {
      expect(cssContent).toContain('@media (max-width: 768px)');
      expect(cssContent).toContain('@media (max-width: 480px)');
      expect(cssContent).toContain('max-width: calc(100vw - 24px)');
    });
  });
});
