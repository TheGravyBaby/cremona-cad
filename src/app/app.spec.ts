import { TestBed } from '@angular/core/testing';
import { App } from './app';

const SIDEBAR_OPEN_KEY = 'app-sidebar-open';

/** The sidebar-collapse tests deliberately assert component state rather than rendered DOM: this
 * spec never calls detectChanges(), and doing so would boot the canvas and a whole recipe panel
 * under jsdom. The layout itself — the tab landing flush against the screen edge, the file strip
 * surviving the collapse — is checked in a real browser. */
describe('App', () => {
  /** App reads sessionStorage and window.innerWidth in its constructor, so every test seeds those
   * before creating the component. */
  const create = () => TestBed.createComponent(App).componentInstance;

  const withWidth = async (px: number, fn: () => void | Promise<void>) => {
    const original = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: px, configurable: true });
    try {
      await fn();
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: original, configurable: true });
    }
  };

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  afterEach(() => sessionStorage.clear());

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('opens the sidebar by default on a wide viewport', async () => {
    await withWidth(1440, () => expect(create().sidebarOpen).toBe(true));
  });

  it('starts the sidebar collapsed on a viewport too narrow to spare 360px', async () => {
    await withWidth(852, () => expect(create().sidebarOpen).toBe(false));
  });

  it('lets a stored preference win over the narrow-viewport default', async () => {
    sessionStorage.setItem(SIDEBAR_OPEN_KEY, 'true');
    await withWidth(852, () => expect(create().sidebarOpen).toBe(true));
  });

  it('honours a stored collapsed state on a wide viewport', async () => {
    sessionStorage.setItem(SIDEBAR_OPEN_KEY, 'false');
    await withWidth(1440, () => expect(create().sidebarOpen).toBe(false));
  });

  it('persists the sidebar state in both directions', async () => {
    await withWidth(1440, () => {
      const app = create();
      app.toggleSidebar();
      expect(app.sidebarOpen).toBe(false);
      expect(sessionStorage.getItem(SIDEBAR_OPEN_KEY)).toBe('false');
      app.toggleSidebar();
      expect(app.sidebarOpen).toBe(true);
      expect(sessionStorage.getItem(SIDEBAR_OPEN_KEY)).toBe('true');
    });
  });
});
