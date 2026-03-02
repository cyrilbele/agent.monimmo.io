import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";

@Component({
  selector: "app-property-detail-property-section",
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: "./property-detail-property-section.component.html",
})
export class PropertyDetailPropertySectionComponent {
  @Input({ required: true }) host!: any;
}
