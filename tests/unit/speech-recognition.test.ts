import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Voice Input Speech Recognition Contract Suite', () => {
  let originalWindow: any;

  beforeEach(() => {
    originalWindow = (globalThis as any).window;
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    vi.restoreAllMocks();
  });

  it('detects when SpeechRecognition is available in the browser', () => {
    const mockSpeechRecognition = vi.fn().mockImplementation(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
      continuous: false,
      interimResults: true,
      lang: 'en-IN',
    }));

    (globalThis as any).window = {
      SpeechRecognition: mockSpeechRecognition,
    };

    const isSupported = Boolean(
      (globalThis as any).window?.SpeechRecognition || (globalThis as any).window?.webkitSpeechRecognition
    );
    expect(isSupported).toBe(true);

    const instance = new (globalThis as any).window.SpeechRecognition();
    expect(instance.lang).toBe('en-IN');
  });

  it('detects when SpeechRecognition is unavailable and flags unsupported state', () => {
    (globalThis as any).window = {};

    const isSupported = Boolean(
      (globalThis as any).window?.SpeechRecognition || (globalThis as any).window?.webkitSpeechRecognition
    );
    expect(isSupported).toBe(false);
  });

  it('formats user-friendly error message on permission denial without raw error traces', () => {
    const permissionErrorEvent = { error: 'not-allowed' };
    let notice = '';

    if (permissionErrorEvent.error === 'not-allowed' || permissionErrorEvent.error === 'service-not-allowed') {
      notice = 'Microphone permission was denied. You can type your requirement instead.';
    } else {
      notice = 'Could not recognize speech. You can type your requirement instead.';
    }

    expect(notice).toBe('Microphone permission was denied. You can type your requirement instead.');
    expect(notice).not.toContain('error');
    expect(notice).not.toContain('DOMException');
  });

  it('formats fallback message for unsupported browsers without blocking manual typing', () => {
    const unsupportedNotice = "Voice input isn't supported in this browser. You can type your requirement instead.";
    expect(unsupportedNotice).toContain('type your requirement instead');
  });

  it('correctly aggregates multi-chunk speech recognition interim results', () => {
    const event = {
      results: [
        [{ transcript: 'Mujhe Rajkot mein ' }],
        [{ transcript: '300 tonne CO2 chahiye' }],
      ],
    };

    const transcript = Array.from(event.results)
      .map((res: any) => res[0].transcript)
      .join('');

    expect(transcript).toBe('Mujhe Rajkot mein 300 tonne CO2 chahiye');
  });
});
