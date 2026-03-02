import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";

@Component({
  selector: "app-property-detail-messages-section",
  imports: [CommonModule],
  templateUrl: "./property-detail-messages-section.component.html",
})
export class PropertyDetailMessagesSectionComponent {
  @Input({ required: true }) host!: any;
}
