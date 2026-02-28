import { Routes } from "@angular/router";

import { authGuard, guestGuard } from "./core/auth.guard";

export const routes: Routes = [
  {
    path: "login",
    canActivate: [guestGuard],
    loadComponent: () =>
      import("./pages/auth/login-page.component").then((module) => module.LoginPageComponent),
  },
  {
    path: "inscription",
    canActivate: [guestGuard],
    loadComponent: () =>
      import("./pages/auth/register-page.component").then(
        (module) => module.RegisterPageComponent,
      ),
  },
  {
    path: "mot-de-passe",
    canActivate: [guestGuard],
    loadComponent: () =>
      import("./pages/auth/forgot-password-page.component").then(
        (module) => module.ForgotPasswordPageComponent,
      ),
  },
  {
    path: "mot-de-passe/reset",
    canActivate: [guestGuard],
    loadComponent: () =>
      import("./pages/auth/reset-password-page.component").then(
        (module) => module.ResetPasswordPageComponent,
      ),
  },
  {
    path: "app",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./layout/app-shell.component").then((module) => module.AppShellComponent),
    children: [
      {
        path: "kanban",
        loadComponent: () =>
          import("./pages/kanban/kanban-page.component").then(
            (module) => module.KanbanPageComponent,
          ),
      },
      {
        path: "biens",
        loadComponent: () =>
          import("./pages/properties/properties-page.component").then(
            (module) => module.PropertiesPageComponent,
          ),
      },
      {
        path: "utilisateurs",
        loadComponent: () =>
          import("./pages/users/users-page.component").then(
            (module) => module.UsersPageComponent,
          ),
      },
      {
        path: "utilisateurs/:id",
        loadComponent: () =>
          import("./pages/users/user-detail-page.component").then(
            (module) => module.UserDetailPageComponent,
          ),
      },
      {
        path: "vocaux",
        loadComponent: () =>
          import("./pages/vocals/vocals-page.component").then(
            (module) => module.VocalsPageComponent,
          ),
      },
      {
        path: "vocaux/:id",
        loadComponent: () =>
          import("./pages/vocals/vocal-detail-page.component").then(
            (module) => module.VocalDetailPageComponent,
          ),
      },
      {
        path: "calendrier",
        loadComponent: () =>
          import("./pages/calendar/calendar-page.component").then(
            (module) => module.CalendarPageComponent,
          ),
      },
      {
        path: "visites/:id",
        loadComponent: () =>
          import("./pages/visit-detail/visit-detail-page.component").then(
            (module) => module.VisitDetailPageComponent,
          ),
      },
      {
        path: "bien/nouveau",
        loadComponent: () =>
          import("./pages/property-create/property-create-page.component").then(
            (module) => module.PropertyCreatePageComponent,
          ),
      },
      {
        path: "bien/:id",
        loadComponent: () =>
          import("./pages/property-detail/property-detail-page.component").then(
            (module) => module.PropertyDetailPageComponent,
          ),
      },
      {
        path: "configuration",
        loadComponent: () =>
          import("./pages/configuration/configuration-page.component").then(
            (module) => module.ConfigurationPageComponent,
          ),
      },
      {
        path: "",
        pathMatch: "full",
        redirectTo: "kanban",
      },
    ],
  },
  {
    path: "",
    pathMatch: "full",
    redirectTo: "login",
  },
  {
    path: "**",
    redirectTo: "login",
  },
];
