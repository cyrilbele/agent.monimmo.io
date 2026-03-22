import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";
import { filter, map, startWith } from "rxjs";

import type {
  GlobalSearchItemResponse,
  GlobalSearchItemType,
  RdvResponse,
  VocalResponse,
} from "../core/api.models";
import { AuthService } from "../core/auth.service";
import { GlobalSearchService } from "../services/global-search.service";
import { PropertyService } from "../services/property.service";
import { UserService } from "../services/user.service";
import { VocalService } from "../services/vocal.service";
import { AssistantWidgetComponent } from "./assistant-widget.component";

interface NavItem {
  label: string;
  route: string;
}

interface BreadcrumbItem {
  label: string;
  route?: string;
}

@Component({
  selector: "app-shell",
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, AssistantWidgetComponent],
  templateUrl: "./app-shell.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  readonly loggingOut = signal(false);
  readonly mobileNavOpen = signal(false);
  readonly globalSearchQuery = signal("");
  readonly globalSearchPending = signal(false);
  readonly globalSearchOpen = signal(false);
  readonly globalSearchItems = signal<GlobalSearchItemResponse[]>([]);
  readonly showGlobalSearchDropdown = computed(
    () => this.globalSearchOpen() && this.globalSearchQuery().trim().length > 0,
  );

  readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly propertyService = inject(PropertyService);
  private readonly vocalService = inject(VocalService);
  private readonly globalSearchService = inject(GlobalSearchService);
  private globalSearchDebounceHandle: ReturnType<typeof setTimeout> | null = null;
  private globalSearchBlurHandle: ReturnType<typeof setTimeout> | null = null;
  private lastGlobalSearchRequestId = 0;
  private readonly userLabelsById = signal<Record<string, string>>({});
  private readonly propertyLabelsById = signal<Record<string, string>>({});
  private readonly appointmentLabelsById = signal<Record<string, string>>({});
  private readonly vocalLabelsById = signal<Record<string, string>>({});
  private readonly pendingUserIds = new Set<string>();
  private readonly pendingPropertyIds = new Set<string>();
  private readonly pendingAppointmentIds = new Set<string>();
  private readonly pendingVocalIds = new Set<string>();
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly primaryNav: readonly NavItem[] = [
    { label: "Pipeline", route: "/app/kanban" },
    { label: "Biens", route: "/app/biens" },
    { label: "Calendrier", route: "/app/calendrier" },
    { label: "Utilisateurs", route: "/app/utilisateurs" },
    { label: "Vocaux", route: "/app/vocaux" },
    { label: "Configuration", route: "/app/configuration" },
  ];

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => this.buildBreadcrumbs(this.currentUrl()));
  readonly isKanbanRoute = computed(() => this.currentUrl().startsWith("/app/kanban"));
  readonly contentWrapperClass = computed(() => {
    if (this.isKanbanRoute()) {
      return "h-full";
    }

    return "px-4 py-5 sm:px-6 lg:px-8";
  });

  constructor() {
    effect(() => {
      const url = this.currentUrl();
      void this.prefetchBreadcrumbLabel(url);
    });

    effect(() => {
      this.currentUrl();
      this.resetGlobalSearchUi();
    });
  }

  toggleMobileNav(): void {
    this.mobileNavOpen.update((isOpen) => !isOpen);
  }

  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }

  onNavLinkClick(): void {
    this.closeMobileNav();
  }

  async logout(): Promise<void> {
    if (this.loggingOut()) {
      return;
    }

    this.loggingOut.set(true);

    try {
      await this.authService.logout();
      this.closeMobileNav();
      await this.router.navigate(["/login"]);
    } finally {
      this.loggingOut.set(false);
    }
  }

  onGlobalSearchInputEvent(event: Event): void {
    const target = event.target;
    const value = target instanceof HTMLInputElement ? target.value : "";
    this.onGlobalSearchInput(value);
  }

  onGlobalSearchInput(value: string): void {
    this.globalSearchQuery.set(value);
    const normalized = value.trim();

    this.clearGlobalSearchDebounce();

    if (!normalized) {
      this.globalSearchItems.set([]);
      this.globalSearchPending.set(false);
      this.globalSearchOpen.set(false);
      return;
    }

    this.globalSearchOpen.set(true);
    this.globalSearchDebounceHandle = setTimeout(() => {
      void this.runGlobalSearch(normalized);
    }, 180);
  }

  onGlobalSearchFocus(): void {
    this.clearGlobalSearchBlur();
    if (this.globalSearchQuery().trim()) {
      this.globalSearchOpen.set(true);
    }
  }

  onGlobalSearchBlur(): void {
    this.clearGlobalSearchBlur();
    this.globalSearchBlurHandle = setTimeout(() => {
      this.globalSearchOpen.set(false);
    }, 140);
  }

  onGlobalSearchEnter(event: Event): void {
    const keyboard = event as KeyboardEvent;
    if (keyboard.key !== "Enter") {
      return;
    }

    keyboard.preventDefault();
    const first = this.globalSearchItems()[0];
    if (!first) {
      return;
    }

    this.selectGlobalSearchItem(first);
  }

  selectGlobalSearchItem(item: GlobalSearchItemResponse): void {
    this.resetGlobalSearchUi();
    void this.router.navigateByUrl(item.route);
  }

  trackGlobalSearchItem(_index: number, item: GlobalSearchItemResponse): string {
    return `${item.type}:${item.id}`;
  }

  globalSearchTypeLabel(type: GlobalSearchItemType): string {
    if (type === "PROPERTY") {
      return "Bien";
    }
    if (type === "USER") {
      return "Contact";
    }
    if (type === "VOCAL") {
      return "Vocal";
    }
    return "Rendez-vous";
  }

  private buildBreadcrumbs(url: string): BreadcrumbItem[] {
    const crumbs: BreadcrumbItem[] = [{ label: "Pipeline", route: "/app/kanban" }];
    const segments = this.getAppPathSegments(url);
    const section = segments[0];
    const entityId = segments[1];

    if (!section || section === "kanban") {
      return crumbs;
    }

    switch (section) {
      case "biens":
        crumbs.push({ label: "Biens" });
        break;
      case "calendrier":
        crumbs.push({ label: "Calendrier" });
        break;
      case "utilisateurs":
        crumbs.push({ label: "Utilisateurs", route: "/app/utilisateurs" });
        if (entityId) {
          crumbs.push({ label: this.userLabelsById()[entityId] ?? "Utilisateur" });
        }
        break;
      case "vocaux":
        crumbs.push({ label: "Vocaux", route: "/app/vocaux" });
        if (entityId) {
          crumbs.push({ label: this.vocalLabelsById()[entityId] ?? "Vocal" });
        }
        break;
      case "rdv":
        crumbs.push({ label: "Calendrier", route: "/app/calendrier" });
        if (entityId) {
          crumbs.push({ label: this.appointmentLabelsById()[entityId] ?? "Rendez-vous" });
        }
        break;
      case "bien":
        crumbs.push({ label: "Biens", route: "/app/biens" });
        if (entityId === "nouveau") {
          crumbs.push({ label: "Nouveau dossier" });
        } else {
          if (entityId) {
            crumbs.push({ label: this.propertyLabelsById()[entityId] ?? "Bien" });
          }
        }
        break;
      case "configuration":
        crumbs.push({ label: "Configuration" });
        break;
      default:
        crumbs.push({ label: this.humanizeSegment(section) });
        for (const segment of segments.slice(1)) {
          if (this.looksLikeTechnicalId(segment)) {
            continue;
          }
          crumbs.push({ label: this.humanizeSegment(segment) });
        }
        break;
    }

    return crumbs;
  }

  private async runGlobalSearch(query: string): Promise<void> {
    const requestId = ++this.lastGlobalSearchRequestId;
    this.globalSearchPending.set(true);

    try {
      const response = await this.globalSearchService.search(query, 20);
      if (requestId !== this.lastGlobalSearchRequestId) {
        return;
      }

      this.globalSearchItems.set(response.items);
    } catch {
      if (requestId !== this.lastGlobalSearchRequestId) {
        return;
      }
      this.globalSearchItems.set([]);
    } finally {
      if (requestId === this.lastGlobalSearchRequestId) {
        this.globalSearchPending.set(false);
      }
    }
  }

  private async prefetchBreadcrumbLabel(url: string): Promise<void> {
    const segments = this.getAppPathSegments(url);
    const section = segments[0];
    const entityId = segments[1];

    if (!section || !entityId) {
      return;
    }

    switch (section) {
      case "utilisateurs":
        await this.prefetchUserLabel(entityId);
        break;
      case "bien":
        if (entityId !== "nouveau") {
          await this.prefetchPropertyLabel(entityId);
        }
        break;
      case "rdv":
        await this.prefetchRdvLabel(entityId);
        break;
      case "vocaux":
        await this.prefetchVocalLabel(entityId);
        break;
      default:
        break;
    }
  }

  private async prefetchUserLabel(userId: string): Promise<void> {
    if (this.userLabelsById()[userId] || this.pendingUserIds.has(userId)) {
      return;
    }

    this.pendingUserIds.add(userId);

    try {
      const user = await this.userService.getById(userId);
      const fullName = `${user.firstName} ${user.lastName}`.trim();
      const label = fullName || user.email || user.phone || "Utilisateur";
      this.userLabelsById.update((current) => ({ ...current, [userId]: label }));
    } catch {
      this.userLabelsById.update((current) => ({ ...current, [userId]: "Utilisateur" }));
    } finally {
      this.pendingUserIds.delete(userId);
    }
  }

  private async prefetchPropertyLabel(propertyId: string): Promise<void> {
    if (this.propertyLabelsById()[propertyId] || this.pendingPropertyIds.has(propertyId)) {
      return;
    }

    this.pendingPropertyIds.add(propertyId);

    try {
      const property = await this.propertyService.getById(propertyId);
      const title = property.title?.trim() || "Bien";
      this.propertyLabelsById.update((current) => ({ ...current, [propertyId]: title }));
    } catch {
      this.propertyLabelsById.update((current) => ({ ...current, [propertyId]: "Bien" }));
    } finally {
      this.pendingPropertyIds.delete(propertyId);
    }
  }

  private async prefetchRdvLabel(rdvId: string): Promise<void> {
    if (this.appointmentLabelsById()[rdvId] || this.pendingAppointmentIds.has(rdvId)) {
      return;
    }

    this.pendingAppointmentIds.add(rdvId);

    try {
      const rdv = await this.propertyService.getRdvById(rdvId);
      this.appointmentLabelsById.update((current) => ({
        ...current,
        [rdvId]: this.rdvLabel(rdv),
      }));
    } catch {
      this.appointmentLabelsById.update((current) => ({ ...current, [rdvId]: "Rendez-vous" }));
    } finally {
      this.pendingAppointmentIds.delete(rdvId);
    }
  }

  private async prefetchVocalLabel(vocalId: string): Promise<void> {
    if (this.vocalLabelsById()[vocalId] || this.pendingVocalIds.has(vocalId)) {
      return;
    }

    this.pendingVocalIds.add(vocalId);

    try {
      const vocal = await this.vocalService.getById(vocalId);
      const label = this.labelFromVocal(vocal);
      this.vocalLabelsById.update((current) => ({ ...current, [vocalId]: label }));
    } catch {
      this.vocalLabelsById.update((current) => ({ ...current, [vocalId]: "Vocal" }));
    } finally {
      this.pendingVocalIds.delete(vocalId);
    }
  }

  private labelFromVocal(vocal: VocalResponse): string {
    const dateLabel = this.formatDateTime(vocal.createdAt);
    const typeLabel = this.vocalTypeLabel(vocal);
    return dateLabel ? `${typeLabel} · ${dateLabel}` : typeLabel;
  }

  private rdvLabel(rdv: RdvResponse): string {
    const title = rdv.title.trim();
    const dateLabel = this.formatDateTime(rdv.startsAt);
    if (title && dateLabel) {
      return `${title} · ${dateLabel}`;
    }
    if (title) {
      return title;
    }
    return dateLabel ? `Rendez-vous · ${dateLabel}` : "Rendez-vous";
  }

  private vocalTypeLabel(vocal: VocalResponse): string {
    switch (vocal.vocalType) {
      case "VISITE_INITIALE":
        return "Visite initiale";
      case "VISITE_SUIVI":
        return "Visite de suivi";
      case "COMPTE_RENDU_VISITE_CLIENT":
        return "Compte rendu visite";
      case "ERREUR_TRAITEMENT":
        return "Vocal en erreur";
      default:
        return "Vocal";
    }
  }

  private getAppPathSegments(url: string): string[] {
    const cleanUrl = url.split("?")[0]?.split("#")[0] ?? "";
    const normalized = cleanUrl.replace(/^\/+|\/+$/g, "");
    const parts = normalized ? normalized.split("/") : [];
    if (parts[0] !== "app") {
      return [];
    }

    return parts.slice(1);
  }

  private humanizeSegment(segment: string): string {
    const cleaned = segment.replace(/-/g, " ").trim();
    if (!cleaned) {
      return segment;
    }

    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  private looksLikeTechnicalId(value: string): boolean {
    const compact = value.replace(/-/g, "");
    return /^[a-f0-9]{12,}$/i.test(compact);
  }

  private formatDateTime(raw: string): string | null {
    const value = new Date(raw);
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(value);
  }

  private clearGlobalSearchDebounce(): void {
    if (!this.globalSearchDebounceHandle) {
      return;
    }

    clearTimeout(this.globalSearchDebounceHandle);
    this.globalSearchDebounceHandle = null;
  }

  private clearGlobalSearchBlur(): void {
    if (!this.globalSearchBlurHandle) {
      return;
    }

    clearTimeout(this.globalSearchBlurHandle);
    this.globalSearchBlurHandle = null;
  }

  private resetGlobalSearchUi(): void {
    this.clearGlobalSearchDebounce();
    this.clearGlobalSearchBlur();
    this.lastGlobalSearchRequestId += 1;
    this.globalSearchPending.set(false);
    this.globalSearchOpen.set(false);
    this.globalSearchQuery.set("");
    this.globalSearchItems.set([]);
  }
}
