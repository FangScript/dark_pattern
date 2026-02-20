import type { InfoListItem, PlaygroundResult } from '../types';

// tracking popup tip
export const trackingTip = 'limit popup to current tab';

// deep think tip
export const deepThinkTip = 'deep think';

// screenshot included tip
export const screenshotIncludedTip = 'include screenshot in request';

// dom included tip
export const domIncludedTip = 'include DOM info in request';

export const apiMetadata = {
  aiAction: {
    group: 'interaction',
    title: 'Scan Page: Analyze webpage for dark patterns automatically',
  },
  aiTap: { group: 'interaction', title: 'Click element to test interaction' },
  aiDoubleClick: { group: 'interaction', title: 'Double-click element' },
  aiHover: {
    group: 'interaction',
    title: 'Hover over element to reveal hidden content',
  },
  aiInput: { group: 'interaction', title: 'Input text to test form behavior' },
  aiRightClick: { group: 'interaction', title: 'Right-click element' },
  aiKeyboardPress: { group: 'interaction', title: 'Press keyboard keys' },
  aiScroll: {
    group: 'interaction',
    title: 'Scroll page to reveal hidden patterns',
  },
  aiLocate: {
    group: 'interaction',
    title: 'Locate suspicious element on page',
  },
  aiQuery: {
    group: 'extraction',
    title: 'Extract dark pattern data from UI elements',
  },
  aiBoolean: {
    group: 'extraction',
    title: 'Check if dark pattern exists (true/false)',
  },
  aiNumber: {
    group: 'extraction',
    title: 'Extract numeric value from deceptive element',
  },
  aiString: { group: 'extraction', title: 'Extract text from UI element' },
  aiAsk: { group: 'extraction', title: 'Ask AI about dark patterns in the UI' },
  aiAssert: {
    group: 'validation',
    title: 'Verify if dark pattern condition exists',
  },
  aiWaitFor: { group: 'validation', title: 'Wait for dark pattern to appear' },
};

export const defaultMainButtons = ['aiAction', 'aiTap', 'aiQuery', 'aiAssert'];

// welcome message template
export const WELCOME_MESSAGE_TEMPLATE: Omit<InfoListItem, 'id' | 'timestamp'> =
  {
    type: 'system',
    content: `Welcome to Pattern Hunter - Dark Pattern Detection Scanner!

This is a panel for analyzing webpages and detecting deceptive UI design patterns using the UI-TARS AI model. You can use natural language instructions to scan pages for dark patterns such as:

• Forced Action - Elements that pressure users into actions
• Fake Scarcity - False urgency or limited availability claims  
• Hidden Costs - Undisclosed fees or charges
• Bait-and-Switch - Misleading offers or redirects
• Confirmshaming - Guilt-inducing opt-out language
• And many more deceptive patterns

Enter your instructions in the input box below to start scanning the current webpage for dark patterns. The AI will analyze the page and report any deceptive UI elements it detects.`,
    loading: false,
    result: undefined,
    replayScriptsInfo: null,
    replayCounter: 0,
    loadingProgressText: '',
    verticalMode: false,
  };

// blank result template
export const BLANK_RESULT: PlaygroundResult = {
  result: undefined,
  dump: null,
  reportHTML: null,
  error: null,
};
