import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";

@Component({
  selector: "app-property-detail-documents-section",
  imports: [CommonModule],
  templateUrl: "./property-detail-documents-section.component.html",
})
export class PropertyDetailDocumentsSectionComponent {
  @Input({ required: true }) host!: any;
}
