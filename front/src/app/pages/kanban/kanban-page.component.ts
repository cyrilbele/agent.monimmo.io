import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";

import type { PropertyResponse, PropertyStatus } from "../../core/api.models";
import {
  PROPERTY_FLOW_STATUSES,
  PROPERTY_STATUSES,
  STATUS_LABELS,
} from "../../core/constants";
import { FileService } from "../../services/file.service";
import { PropertyService } from "../../services/property.service";

type PropertiesByStatusMap = Record<PropertyStatus, PropertyResponse[]>;

@Component({
  selector: "app-kanban-page",
  imports: [CommonModule, RouterLink],
  templateUrl: "./kanban-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KanbanPageComponent implements OnInit {
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly properties = signal<PropertyResponse[]>([]);
  readonly propertyImageUrls = signal<Record<string, string | null>>({});
  readonly updatingPropertyId = signal<string | null>(null);

  readonly draggingPropertyId = signal<string | null>(null);
  readonly draggingFromStatus = signal<PropertyStatus | null>(null);
  readonly dropTargetStatus = signal<PropertyStatus | null>(null);

  private readonly propertyService = inject(PropertyService);
  private readonly fileService = inject(FileService);

  readonly columns = PROPERTY_FLOW_STATUSES;
  readonly availableStatuses = PROPERTY_STATUSES;
  readonly statusLabels = STATUS_LABELS;

  readonly propertiesByStatus = computed<PropertiesByStatusMap>(() => {
    const grouped = Object.fromEntries(
      this.availableStatuses.map((status) => [status, [] as PropertyResponse[]]),
    ) as PropertiesByStatusMap;

    for (const property of this.properties()) {
      grouped[property.status].push(property);
    }

    return grouped;
  });

  ngOnInit(): void {
    void this.loadProperties();
  }

  columnItems(status: PropertyStatus): PropertyResponse[] {
    return this.propertiesByStatus()[status];
  }

  columnDropClass(status: PropertyStatus): string {
    const isDropTarget = this.dropTargetStatus() === status;
    const base =
      "flex h-full w-[320px] shrink-0 flex-col rounded-2xl border border-slate-200 bg-slate-50 p-3 transition";

    if (isDropTarget) {
      return `${base} ring-2 ring-blue-300 border-blue-300 bg-blue-50/70`;
    }

    return base;
  }

  async loadProperties(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.propertyService.list(100);
      this.properties.set(response.items);
      await this.loadPropertyImages(response.items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chargement impossible.";
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  onCardDragStart(property: PropertyResponse, event: DragEvent): void {
    this.draggingPropertyId.set(property.id);
    this.draggingFromStatus.set(property.status);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", property.id);
    }
  }

  onCardDragEnd(): void {
    this.resetDragState();
  }

  onColumnDragOver(status: PropertyStatus, event: DragEvent): void {
    const draggingPropertyId = this.draggingPropertyId();
    const draggingFromStatus = this.draggingFromStatus();

    if (!draggingPropertyId || !draggingFromStatus || draggingFromStatus === status) {
      return;
    }

    event.preventDefault();
    this.dropTargetStatus.set(status);

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  onColumnDragLeave(status: PropertyStatus, event: DragEvent): void {
    const currentTarget = event.currentTarget;
    if (!(currentTarget instanceof HTMLElement)) {
      return;
    }

    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && currentTarget.contains(relatedTarget)) {
      return;
    }

    if (this.dropTargetStatus() === status) {
      this.dropTargetStatus.set(null);
    }
  }

  async onColumnDrop(status: PropertyStatus, event: DragEvent): Promise<void> {
    event.preventDefault();

    const propertyId = this.draggingPropertyId();
    const fromStatus = this.draggingFromStatus();

    this.dropTargetStatus.set(null);

    if (!propertyId || !fromStatus || fromStatus === status) {
      this.resetDragState();
      return;
    }

    await this.movePropertyToStatus(propertyId, status);
    this.resetDragState();
  }

  private async movePropertyToStatus(
    propertyId: string,
    nextStatus: PropertyStatus,
  ): Promise<void> {
    this.updatingPropertyId.set(propertyId);

    try {
      const updated = await this.propertyService.updateStatus(propertyId, nextStatus);
      this.properties.update((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mise à jour impossible.";
      this.error.set(message);
    } finally {
      this.updatingPropertyId.set(null);
    }
  }

  formatPrice(price: number | null | undefined): string {
    if (typeof price !== "number") {
      return "Prix à définir";
    }

    return `${(price / 1000).toFixed(price >= 1000000 ? 1 : 0)}k€`;
  }

  trackByProperty(_index: number, property: PropertyResponse): string {
    return property.id;
  }

  propertyImageUrl(propertyId: string): string | null {
    return this.propertyImageUrls()[propertyId] ?? null;
  }

  resolveDisplayPrice(property: PropertyResponse): number | null {
    if (typeof property.price === "number" && Number.isFinite(property.price) && property.price > 0) {
      return property.price;
    }

    if (!this.isRecord(property.details)) {
      return null;
    }

    const finance = this.isRecord(property.details["finance"]) ? property.details["finance"] : null;
    if (!finance) {
      return null;
    }

    return this.parsePositiveNumber(finance["salePriceTtc"]);
  }

  private resetDragState(): void {
    this.draggingPropertyId.set(null);
    this.draggingFromStatus.set(null);
    this.dropTargetStatus.set(null);
  }

  private async loadPropertyImages(properties: PropertyResponse[]): Promise<void> {
    const entries = await Promise.all(
      properties.map(async (property) => {
        const imageUrl = await this.resolvePropertyImageUrl(property.id);
        return [property.id, imageUrl] as const;
      }),
    );

    this.propertyImageUrls.set(Object.fromEntries(entries));
  }

  private async resolvePropertyImageUrl(propertyId: string): Promise<string | null> {
    try {
      const files = await this.fileService.listByProperty(propertyId, 100);
      const photo = files.items
        .filter((file) => file.typeDocument === "PHOTOS_HD")
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!photo) {
        return null;
      }

      const download = await this.fileService.getDownloadUrl(photo.id);
      return download.url;
    } catch {
      return null;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private parsePositiveNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }

    if (typeof value === "string") {
      const compact = value
        .trim()
        .replace(/\s+/g, "")
        .replace(/\u00A0/g, "")
        .replace(/\u202F/g, "")
        .replace(/€/g, "");
      if (!compact) {
        return null;
      }

      const hasComma = compact.includes(",");
      const hasDot = compact.includes(".");
      const normalized = hasComma && hasDot ? compact.replace(/\./g, "").replace(",", ".") : compact.replace(",", ".");
      const parsed = Number(normalized);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  }
}
