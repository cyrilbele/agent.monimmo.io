import { CommonModule } from "@angular/common";
import { Component, ElementRef, Input, OnDestroy, ViewChild } from "@angular/core";

@Component({
  selector: "app-property-detail-valuation-section",
  imports: [CommonModule],
  templateUrl: "./property-detail-valuation-section.component.html",
  styleUrls: ["./property-detail-valuation-section.component.css"],
})
export class PropertyDetailValuationSectionComponent implements OnDestroy {
  @Input({ required: true }) host!: any;

  @ViewChild("comparablesChartCanvas")
  set comparablesChartCanvasRef(value: ElementRef<HTMLCanvasElement> | undefined) {
    if (!this.host) {
      return;
    }

    this.host.setComparablesChartCanvas(value?.nativeElement ?? null);
  }

  ngOnDestroy(): void {
    if (!this.host) {
      return;
    }

    this.host.setComparablesChartCanvas(null);
  }
}
