import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { RouterLink } from "@angular/router";

@Component({
  selector: "app-property-detail-prospects-section",
  imports: [CommonModule, RouterLink],
  templateUrl: "./property-detail-prospects-section.component.html",
})
export class PropertyDetailProspectsSectionComponent {
  @Input({ required: true }) host!: any;
}
