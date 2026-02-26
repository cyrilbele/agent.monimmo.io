import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
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

import { AuthService } from "../core/auth.service";

interface NavItem {
  label: string;
  route: string;
}

@Component({
  selector: "app-shell",
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: "./app-shell.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  readonly loggingOut = signal(false);

  readonly authService = inject(AuthService);
  private readonly router = inject(Router);
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
    { label: "Utilisateurs", route: "/app/utilisateurs" },
    { label: "Nouveau dossier", route: "/app/bien/nouveau" },
    { label: "Configuration", route: "/app/configuration" },
  ];

  readonly secondaryNav: readonly NavItem[] = [
    { label: "Paramètres", route: "/app/configuration" },
  ];

  readonly isKanbanRoute = computed(() => this.currentUrl().startsWith("/app/kanban"));
  readonly contentWrapperClass = computed(() => {
    if (this.isKanbanRoute()) {
      return "h-full";
    }

    return "px-4 py-5 sm:px-6 lg:px-8";
  });

  async logout(): Promise<void> {
    if (this.loggingOut()) {
      return;
    }

    this.loggingOut.set(true);

    try {
      await this.authService.logout();
      await this.router.navigate(["/login"]);
    } finally {
      this.loggingOut.set(false);
    }
  }
}
