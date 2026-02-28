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
import { STATUS_LABELS } from "../../core/constants";
import { PropertyService } from "../../services/property.service";

@Component({
  selector: "app-properties-page",
  imports: [CommonModule, RouterLink],
  templateUrl: "./properties-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertiesPageComponent implements OnInit {
  private readonly propertyService = inject(PropertyService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly properties = signal<PropertyResponse[]>([]);
  readonly propertiesCount = computed(() => this.properties().length);
  readonly sortedProperties = computed(() =>
    this.properties()
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );

  ngOnInit(): void {
    void this.loadProperties();
  }

  async loadProperties(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.propertyService.list(100);
      this.properties.set(response.items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chargement des biens impossible.";
      this.error.set(message);
      this.properties.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  statusLabel(status: PropertyStatus): string {
    return STATUS_LABELS[status] ?? status;
  }

  displayAddress(property: PropertyResponse): string {
    const address = property.address?.trim();
    const cityLine = `${property.postalCode} ${property.city}`.trim();

    if (address && cityLine) {
      return `${address}, ${cityLine}`;
    }

    if (address) {
      return address;
    }

    return cityLine || "Adresse non renseignée";
  }

  displaySalePrice(property: PropertyResponse): string {
    const salePrice = this.resolveSalePrice(property);
    if (salePrice === null) {
      return "Non renseigné";
    }

    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(salePrice);
  }

  private resolveSalePrice(property: PropertyResponse): number | null {
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private parsePositiveNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }

    if (typeof value !== "string") {
      return null;
    }

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
    const normalized = hasComma && hasDot
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact.replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
}
