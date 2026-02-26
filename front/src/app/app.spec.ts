import { TestBed } from "@angular/core/testing";

import { App } from "./app";

describe("App", () => {
  it("crée le composant racine", () => {
    const fixture = TestBed.configureTestingModule({
      imports: [App],
    }).createComponent(App);

    expect(fixture.componentInstance).toBeTruthy();
  });
});
