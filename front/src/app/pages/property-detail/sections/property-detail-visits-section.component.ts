import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";

@Component({
  selector: "app-property-detail-visits-section",
  imports: [CommonModule],
  templateUrl: "./property-detail-visits-section.component.html",
})
export class PropertyDetailVisitsSectionComponent {
  @Input({ required: true }) host!: any;
}
