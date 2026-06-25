import puppeteer, { Browser, Page } from "puppeteer";

let browserInstance: Browser | null = null;
let browserCloseTimeout: NodeJS.Timeout | null = null;
let activePages = 0;
let browserLaunching = false;

// Queue for requests waiting for browser to launch
const browserWaitQueue: Array<{
  resolve: (browser: Browser) => void;
  reject: (error: Error) => void;
}> = [];

// FIFO queue for requests waiting for a slot
const slotWaitQueue: Array<{
  resolve: () => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}> = [];

const BROWSER_IDLE_TIMEOUT = 60000; // Close browser after 1 minute of inactivity
const MAX_CONCURRENT_PAGES = 5; // Limit concurrent PDF generations
const SLOT_WAIT_TIMEOUT_MS = 60000; // Max time to wait for a slot (1 minute)

async function getBrowserPath(): Promise<string | undefined> {
  const { execSync } = await import('child_process');
  let chromiumPath: string | undefined;
  
  try {
    const foundPath = execSync('which chromium || which chromium-browser || which google-chrome 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (foundPath && foundPath.length > 0) {
      chromiumPath = foundPath;
      console.log(`[Browser Pool] Using system Chromium at: ${chromiumPath}`);
    }
  } catch {
    // which command failed
  }
  
  if (!chromiumPath) {
    try {
      chromiumPath = puppeteer.executablePath();
      console.log(`[Browser Pool] Using Puppeteer bundled Chromium at: ${chromiumPath}`);
    } catch {
      console.log('[Browser Pool] Could not get Puppeteer executable path, will use default');
      chromiumPath = undefined;
    }
  }
  
  return chromiumPath;
}

async function launchBrowser(): Promise<Browser> {
  const chromiumPath = await getBrowserPath();
  
  console.log(`[Browser Pool] Launching new browser instance...`);
  
  const browser = await puppeteer.launch({
    headless: true,
    ...(chromiumPath ? { executablePath: chromiumPath } : {}),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--single-process',
      '--font-render-hinting=none',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--safebrowsing-disable-auto-update'
    ]
  });
  
  browser.on('disconnected', () => {
    console.log('[Browser Pool] Browser disconnected');
    browserInstance = null;
    browserLaunching = false;
  });
  
  console.log(`[Browser Pool] Browser launched successfully`);
  return browser;
}

function scheduleClose() {
  // Only schedule close if browser exists and no active pages
  if (!browserInstance || activePages > 0) {
    return;
  }
  
  if (browserCloseTimeout) {
    clearTimeout(browserCloseTimeout);
  }
  
  browserCloseTimeout = setTimeout(async () => {
    if (browserInstance && activePages === 0) {
      console.log('[Browser Pool] Closing idle browser to free memory');
      try {
        await browserInstance.close();
      } catch (e) {
        console.error('[Browser Pool] Error closing browser:', e);
      }
      browserInstance = null;
    }
  }, BROWSER_IDLE_TIMEOUT);
}

function isBrowserConnected(): boolean {
  if (!browserInstance) return false;
  try {
    // Puppeteer's Browser has isConnected() method
    return typeof browserInstance.isConnected === 'function' 
      ? browserInstance.isConnected() 
      : true; // Fallback for older versions
  } catch {
    return false;
  }
}

async function getBrowser(): Promise<Browser> {
  // Cancel any scheduled close
  if (browserCloseTimeout) {
    clearTimeout(browserCloseTimeout);
    browserCloseTimeout = null;
  }
  
  // If browser exists and is connected, return it
  if (browserInstance && isBrowserConnected()) {
    return browserInstance;
  }
  
  // If browser is currently launching, wait in queue
  if (browserLaunching) {
    return new Promise((resolve, reject) => {
      browserWaitQueue.push({ resolve, reject });
    });
  }
  
  // Launch new browser
  browserLaunching = true;
  try {
    browserInstance = await launchBrowser();
    browserLaunching = false;
    
    // Resolve all waiting requests
    while (browserWaitQueue.length > 0) {
      const waiter = browserWaitQueue.shift();
      if (waiter && browserInstance) {
        waiter.resolve(browserInstance);
      }
    }
    
    return browserInstance;
  } catch (error) {
    browserLaunching = false;
    browserInstance = null;
    
    // Reject all waiting requests
    const err = error as Error;
    while (browserWaitQueue.length > 0) {
      const waiter = browserWaitQueue.shift();
      if (waiter) {
        waiter.reject(err);
      }
    }
    
    throw error;
  }
}

// Process the slot wait queue - call this when a slot becomes available
function processSlotQueue() {
  if (slotWaitQueue.length > 0 && activePages < MAX_CONCURRENT_PAGES) {
    const next = slotWaitQueue.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve();
    }
  }
}

async function acquireSlot(): Promise<void> {
  // If slot is available, take it immediately
  if (activePages < MAX_CONCURRENT_PAGES) {
    activePages++;
    return;
  }
  
  // Wait in FIFO queue for a slot
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // Remove this entry from queue on timeout
      const index = slotWaitQueue.findIndex(entry => entry.timer === timer);
      if (index !== -1) {
        slotWaitQueue.splice(index, 1);
      }
      reject(new Error('PDF generation queue timeout. Server is busy, please try again later.'));
    }, SLOT_WAIT_TIMEOUT_MS);
    
    slotWaitQueue.push({
      resolve: () => {
        activePages++;
        resolve();
      },
      reject,
      timer
    });
  });
}

function releaseSlot() {
  activePages = Math.max(0, activePages - 1);
  // Process next item in queue if any
  processSlotQueue();
}

export async function generatePdfFromHtml(html: string): Promise<Buffer> {
  // Acquire a slot (waits in queue if at capacity)
  await acquireSlot();
  
  let page: Page | null = null;
  
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
    });
    
    return Buffer.from(pdfBuffer);
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.error('[Browser Pool] Error closing page:', e);
      }
    }
    
    // Release slot and process queue
    releaseSlot();
    
    // Schedule browser close if idle
    if (browserInstance && activePages === 0) {
      scheduleClose();
    }
  }
}

export async function closeBrowser(): Promise<void> {
  // Clear close timeout
  if (browserCloseTimeout) {
    clearTimeout(browserCloseTimeout);
    browserCloseTimeout = null;
  }
  
  // Reject all waiting slot requests
  while (slotWaitQueue.length > 0) {
    const waiter = slotWaitQueue.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Browser pool shutting down'));
    }
  }
  
  // Reject all waiting browser requests
  while (browserWaitQueue.length > 0) {
    const waiter = browserWaitQueue.shift();
    if (waiter) {
      waiter.reject(new Error('Browser pool shutting down'));
    }
  }
  
  // Close browser
  if (browserInstance) {
    console.log('[Browser Pool] Force closing browser');
    try {
      await browserInstance.close();
    } catch (e) {
      console.error('[Browser Pool] Error force closing browser:', e);
    }
    browserInstance = null;
  }
  
  browserLaunching = false;
  activePages = 0;
}

export function getBrowserStats() {
  return {
    isRunning: browserInstance !== null && isBrowserConnected(),
    activePages,
    maxConcurrentPages: MAX_CONCURRENT_PAGES,
    slotQueueLength: slotWaitQueue.length,
    browserQueueLength: browserWaitQueue.length
  };
}
