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

import type { PropertyVisitResponse, VocalResponse } from "../core/api.models";
import { AuthService } from "../core/auth.service";
import { PropertyService } from "../services/property.service";
import { UserService } from "../services/user.service";
import { VocalService } from "../services/vocal.service";

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
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: "./app-shell.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  readonly loggingOut = signal(false);
  readonly mobileNavOpen = signal(false);

  readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly propertyService = inject(PropertyService);
  private readonly vocalService = inject(VocalService);
  private readonly userLabelsById = signal<Record<string, string>>({});
  private readonly propertyLabelsById = signal<Record<string, string>>({});
  private readonly visitLabelsById = signal<Record<string, string>>({});
  private readonly vocalLabelsById = signal<Record<string, string>>({});
  private readonly pendingUserIds = new Set<string>();
  private readonly pendingPropertyIds = new Set<string>();
  private readonly pendingVisitIds = new Set<string>();
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
      case "visites":
        crumbs.push({ label: "Calendrier", route: "/app/calendrier" });
        if (entityId) {
          crumbs.push({ label: this.visitLabelsById()[entityId] ?? "Visite" });
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
      case "visites":
        await this.prefetchVisitLabel(entityId);
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

  private async prefetchVisitLabel(visitId: string): Promise<void> {
    if (this.visitLabelsById()[visitId] || this.pendingVisitIds.has(visitId)) {
      return;
    }

    this.pendingVisitIds.add(visitId);

    try {
      const visit = await this.propertyService.getVisitById(visitId);
      const label = this.visitLabelFromVisit(visit);
      this.visitLabelsById.update((current) => ({ ...current, [visitId]: label }));
    } catch {
      this.visitLabelsById.update((current) => ({ ...current, [visitId]: "Visite" }));
    } finally {
      this.pendingVisitIds.delete(visitId);
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

  private visitLabelFromVisit(visit: PropertyVisitResponse): string {
    const propertyTitle = visit.propertyTitle.trim();
    const dateLabel = this.formatDateTime(visit.startsAt);
    if (propertyTitle && dateLabel) {
      return `${propertyTitle} · ${dateLabel}`;
    }
    if (propertyTitle) {
      return propertyTitle;
    }
    return dateLabel ? `Visite · ${dateLabel}` : "Visite";
  }

  private labelFromVocal(vocal: VocalResponse): string {
    const dateLabel = this.formatDateTime(vocal.createdAt);
    const typeLabel = this.vocalTypeLabel(vocal);
    return dateLabel ? `${typeLabel} · ${dateLabel}` : typeLabel;
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
}
