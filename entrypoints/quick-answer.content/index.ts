import { browser, defineContentScript, type Browser } from '#imports';
import DOMPurify from 'dompurify';
import { PORT_NAME, TRIGGER_EVENT, type AskEvent, type AskRequest, type KagiItem, type RuntimeMessage, type Turn } from '@/lib/messages';
import { escapeHtml, renderAnswer, splitFollowups } from '@/lib/render';
import { loadThread, saveThread, type Thread } from '@/lib/thread';
import './style.css';

interface Pending {
  question: string;
  answer: string;
  searches: string[];
  status?: 'reading' | 'thinking' | 'searching';
  error?: { message: string; missingKey?: boolean };
}

const quoted = (queries: string[]) => queries.map((q) => `“${escapeHtml(q)}”`).join(', ');

/** Identifies a search: the same query under another lens or filter has different sources. */
function searchKey(): string {
  const params = new URLSearchParams(location.search);
  params.delete('qa');
  params.sort();
  return `${location.pathname}?${params}`;
}

/** One quick answer thread, bound to a single search. */
class QuickAnswer {
  private reply: HTMLElement;
  private moreInfo: HTMLElement;
  private followupsBox: HTMLElement;
  private followupsList: HTMLElement;
  private formBox: HTMLElement;
  private form: HTMLFormElement;
  private prompt: HTMLTextAreaElement;
  private showMoreBtn: HTMLButtonElement;
  private favicons = new Map<string, string>();
  private thread: Thread = { sources: [], turns: [] };
  private items: KagiItem[] = [];
  private pending?: Pending;
  private port?: Browser.runtime.Port;
  private frame = 0;
  private lifetime = new AbortController();

  constructor(
    readonly box: HTMLElement,
    readonly key: string,
  ) {
    this.reply = box.querySelector('._0_qa_reply_box')!;
    this.moreInfo = box.querySelector('._0_qa_more_info_box')!;
    this.followupsBox = box.querySelector('._0_qa_followups_box')!;
    this.followupsList = box.querySelector('._0_qa_followups_content')!;
    this.formBox = box.querySelector('._0_qa_form_box')!;
    this.form = box.querySelector('#_0_nt_qa_form')!;
    this.prompt = box.querySelector('#_0_qa_query')!;
    this.showMoreBtn = box.querySelector('._0_qa_show_more_btn')!;

    // Our thread lives on this page, so Kagi's "continue in Assistant" link would mislead.
    box.querySelector('._0_qa_cia_link')?.replaceWith('Follow-ups');

    const { signal } = this.lifetime;
    // Capture phase on window runs before Kagi's submit handler, which opens Kagi Assistant.
    window.addEventListener(
      'submit',
      (e) => {
        if (e.target !== this.form) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const question = this.prompt.value.trim();
        if (!question || this.pending) return;
        this.prompt.value = '';
        this.prompt.style.height = '';
        this.ask(question);
      },
      { capture: true, signal },
    );
    this.reply.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.kqa-retry')) this.retry();
        else if (target.closest('.kqa-settings')) {
          e.preventDefault();
          browser.runtime.sendMessage({ type: 'open-options' } satisfies RuntimeMessage);
        }
      },
      { signal },
    );
    // Kagi shows and hides the more-info box itself (Show More, saved preference), in its own order.
    const observer = new MutationObserver(() => this.syncForm());
    observer.observe(this.moreInfo, { attributes: true, attributeFilter: ['hidden'] });
    signal.addEventListener('abort', () => observer.disconnect());
  }

  dispose() {
    this.lifetime.abort();
    this.port?.disconnect();
    cancelAnimationFrame(this.frame);
  }

  private get active(): boolean {
    return this.thread.turns.length > 0 || !!this.pending;
  }

  start(items: KagiItem[]) {
    if (this.active || this.restore()) return;
    this.items = items;
    this.ask(new URLSearchParams(location.search).get('q') ?? '');
  }

  /** Shows the saved thread for this search, if any. */
  restore(): boolean {
    if (this.active) return true;
    const saved = loadThread(this.key);
    if (!saved) return false;
    this.thread = saved;
    this.disableTrigger();
    this.render();
    this.finish();
    return true;
  }

  private ask(question: string) {
    const pending: Pending = { question, answer: '', searches: [] };
    this.pending = pending;
    this.disableTrigger();
    this.box.hidden = false;
    this.showMoreBtn.hidden = true;
    this.followupsBox.hidden = true;
    this.syncForm();
    this.render();

    const request: AskRequest = {
      question,
      history: this.thread.turns,
      lens: new URLSearchParams(location.search).get('lens') ?? undefined,
      ...(this.thread.sources.length ? { sources: this.thread.sources } : { items: this.items }),
    };
    const port = (this.port = browser.runtime.connect({ name: PORT_NAME }));
    port.onMessage.addListener((event: AskEvent) => {
      if (event.type === 'status') pending.status = event.status;
      else if (event.type === 'sources') this.thread.sources = event.sources;
      else if (event.type === 'error') pending.error = event;
      else if (event.type === 'delta') pending.answer += event.text;
      else if (event.type === 'search') {
        // Drop any text the model wrote before deciding to search.
        pending.answer = '';
        pending.searches.push(event.query);
        pending.status = 'searching';
      } else if (event.type === 'done') {
        const turn: Turn = { question, answer: pending.answer };
        if (pending.searches.length) turn.searches = pending.searches;
        this.thread.turns.push(turn);
        this.pending = undefined;
        saveThread(this.key, this.thread);
        this.finish();
      }
      this.scheduleRender();
    });
    port.onDisconnect.addListener(() => {
      if (this.pending !== pending || pending.error || this.lifetime.signal.aborted) return;
      pending.error = { message: 'Lost connection to the extension.' };
      this.scheduleRender();
    });
    port.postMessage(request);
  }

  private retry() {
    const question = this.pending?.question;
    if (!question) return;
    this.pending = undefined;
    this.ask(question);
  }

  private finish() {
    this.box.hidden = false;
    this.showMoreBtn.hidden = false;
    this.renderFollowups();
    this.syncForm();
  }

  private syncForm() {
    this.formBox.hidden = this.moreInfo.hidden || !!this.pending || !this.thread.turns.length;
  }

  private disableTrigger() {
    const trigger = document.querySelector<HTMLButtonElement>('._0_quick_answer_trigger_btn');
    if (trigger) trigger.disabled = true;
  }

  private scheduleRender() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.render());
  }

  private render() {
    const turns = this.thread.turns.map((t, i) =>
      this.renderTurn(t.question, this.renderSearches(t.searches) + this.renderMarkdown(t.answer), i),
    );
    if (this.pending) turns.push(this.renderTurn(this.pending.question, this.renderPending(this.pending), turns.length));
    this.reply.innerHTML = turns.join('');
  }

  private renderTurn(question: string, body: string, index: number): string {
    return index === 0
      ? body
      : `<div class="kqa-turn"><p class="kqa-question">${escapeHtml(question)}</p>${body}</div>`;
  }

  private renderSearches(searches: string[] = []): string {
    return searches.length ? `<p class="kqa-searches">Searched ${quoted(searches)}</p>` : '';
  }

  private renderPending({ answer, status, searches, error }: Pending): string {
    const body = answer ? this.renderSearches(searches) + this.renderMarkdown(answer) : '';
    if (error) {
      const settings = error.missingKey ? ' <a href="#" class="kqa-settings">Open settings</a>' : '';
      return `${body}<p class="kqa-error">${escapeHtml(error.message)}${settings} <button type="button" class="kqa-retry">Retry</button></p>`;
    }
    if (body) return body;
    const text =
      status === 'searching' ? `Searching ${quoted(searches)}…` : status === 'thinking' ? 'Thinking…' : 'Reading sources…';
    return `${this.renderSearches(status === 'searching' ? [] : searches)}<p class="kqa-status">${text}</p>`;
  }

  private renderMarkdown(text: string): string {
    return renderAnswer(splitFollowups(text).answer, this.thread.sources, {
      sanitize: (html) => DOMPurify.sanitize(html),
      favicon: (url) => this.faviconFor(url),
    });
  }

  private renderFollowups() {
    const last = this.thread.turns.at(-1);
    const template = document.querySelector<HTMLTemplateElement>('#_0_new_follow_up_item_template')?.content;
    if (!last || !template) return;
    this.followupsList.replaceChildren(
      ...splitFollowups(last.answer).followups.map((question) => {
        const item = template.cloneNode(true) as DocumentFragment;
        const link = item.querySelector<HTMLAnchorElement>('._0_url')!;
        link.href = '#';
        link.removeAttribute('target');
        link.addEventListener('click', (e) => {
          e.preventDefault();
          if (!this.pending) this.ask(question);
        });
        item.querySelector<HTMLElement>('._0_title')!.textContent = question;
        return item;
      }),
    );
    this.followupsBox.hidden = !this.followupsList.childElementCount;
  }

  private faviconFor(url: string): string | undefined {
    if (!this.favicons.size) {
      for (const result of document.querySelectorAll('._0_SRI')) {
        const link = result.querySelector<HTMLAnchorElement>('a._0_URL');
        const icon = result.querySelector<HTMLImageElement>('img.__domain-favicon');
        if (link && icon) this.favicons.set(new URL(link.href).hostname, icon.src);
      }
    }
    return this.favicons.get(new URL(url).hostname);
  }
}

export default defineContentScript({
  matches: ['https://kagi.com/search*'],
  runAt: 'document_start',
  main() {
    let session: QuickAnswer | undefined;

    // Kagi searches in-page (new query, lens, filters) and reuses the box, so sessions follow the URL.
    const current = () => {
      const box = document.querySelector<HTMLElement>('._0_quick_answer_box');
      const key = searchKey();
      if (session && (session.box !== box || session.key !== key)) {
        session.dispose();
        session = undefined;
      }
      if (box) session ??= new QuickAnswer(box, key);
      return session;
    };

    document.addEventListener(TRIGGER_EVENT, (e) => {
      const { items = [] } = JSON.parse((e as CustomEvent<string>).detail);
      current()?.start(items);
    });
    // Kagi resets the box when a new search starts, so stop the old stream from writing into it.
    window.addEventListener('client:socket_open', () => current());
    // Deferred so Kagi's own quick answer setup for the new results runs first.
    window.addEventListener('provider:search', () => setTimeout(() => current()?.restore()));
  },
});
