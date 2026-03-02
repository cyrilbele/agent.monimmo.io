import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";

import type {
  AccountUserResponse,
  ComparablePropertyType,
  PropertyComparablesResponse,
  FileResponse,
  MessageResponse,
  PropertyPatchRequest,
  PropertyProspectResponse,
  PropertyRiskResponse,
  PropertyValuationAIRequest,
  PropertyValuationAIResponse,
  PropertyResponse,
  PropertyStatus,
  PropertyVisitResponse,
  TypeDocument,
} from "../../core/api.models";
import {
  DOCUMENT_TABS,
  PROPERTY_DETAILS_CATEGORIES,
  PROPERTY_FLOW_STATUSES,
  STATUS_LABELS,
  type DocumentTabDefinition,
  type DocumentTabId,
  type PropertyDetailsCategoryDefinition,
  type PropertyDetailsCategoryId,
  type PropertyDetailsFieldDefinition,
} from "../../core/constants";
import { FileService } from "../../services/file.service";
import {
  InseeCityService,
  type InseeCityIndicators,
} from "../../services/insee-city.service";
import { AppSettingsService } from "../../services/app-settings.service";
import { MessageService } from "../../services/message.service";
import { PropertyService } from "../../services/property.service";
import { UserService } from "../../services/user.service";
import { VocalService } from "../../services/vocal.service";
import {
  computeComparablesRegression,
  resolveComparablePricingLabel,
} from "./property-comparables.utils";
import { PropertyDetailDocumentsSectionComponent } from "./sections/property-detail-documents-section.component";
import { PropertyDetailMessagesSectionComponent } from "./sections/property-detail-messages-section.component";
import { PropertyDetailPropertySectionComponent } from "./sections/property-detail-property-section.component";
import { PropertyDetailProspectsSectionComponent } from "./sections/property-detail-prospects-section.component";
import { PropertyDetailValuationSectionComponent } from "./sections/property-detail-valuation-section.component";
import { PropertyDetailVisitsSectionComponent } from "./sections/property-detail-visits-section.component";
import {
  computeRentalProfitability,
  type RentalProfitabilityResult,
} from "./property-detail-rental.utils";
import {
  Chart,
  registerables,
  type ChartDataset,
  type ScatterDataPoint,
} from "chart.js";
import { marked } from "marked";

Chart.register(...registerables);

type MainTabId =
  | "property"
  | "documents"
  | "prospects"
  | "visits"
  | "messages"
  | "valuation";
type ProspectMode = "existing" | "new";
type VisitProspectMode = "existing" | "new";
type CategoryControls = Record<string, FormControl<string>>;
type CategoryForm = FormGroup<CategoryControls>;
type CategoryForms = Record<PropertyDetailsCategoryId, CategoryForm>;
type ComparableScatterPoint = ScatterDataPoint & {
  saleDate?: string;
  landSurfaceM2?: number | null;
  city?: string | null;
  postalCode?: string | null;
  distanceM?: number | null;
};
type ExpectedDocumentItem = {
  key: string;
  index: number;
  label: string;
  typeDocument: TypeDocument | null;
  provided: boolean;
};
type MarketTrendYearRow = {
  year: number;
  salesCount: number;
  avgPricePerM2: number | null;
  salesCountVariationPct: number | null;
  avgPricePerM2VariationPct: number | null;
};
type ComparableSalesSortKey = "saleDate" | "surfaceM2" | "landSurfaceM2" | "salePrice" | "pricePerM2";
type ComparableSalesSortDirection = "asc" | "desc";
type ComparableSalesSortState = {
  key: ComparableSalesSortKey;
  direction: ComparableSalesSortDirection;
};
type ValuationKeyCriterion = {
  categoryId: PropertyDetailsCategoryId;
  field: PropertyDetailsFieldDefinition;
  value: string;
};
type PersistedValuationComparableFilters = {
  surfaceMinM2: number | null;
  surfaceMaxM2: number | null;
  landSurfaceMinM2: number | null;
  landSurfaceMaxM2: number | null;
};
type LoadComparablesOptions = {
  forceRefresh?: boolean;
};

const DEFAULT_TYPE_DOCUMENT: TypeDocument = "PIECE_IDENTITE";
const EXPECTED_DOCUMENT_HIDDEN_KEY_SEPARATOR = "::";
const FRONT_COMPARABLE_PRICE_TOLERANCE = 0.1;
const CHART_OUTLIER_PRICE_PER_M2_MULTIPLIER = 3;
const MIN_COMPARABLE_PRICE_PER_M2 = 500;
const VALUATION_AI_DETAILS_KEY = "valuationAiSnapshot";
const VALUATION_COMPARABLE_FILTERS_DETAILS_KEY = "valuationComparableFilters";
const SALES_PAGE_SIZE = 10;
const COMPARABLE_TYPE_OPTIONS: Array<{ value: ComparablePropertyType; label: string }> = [
  { value: "APPARTEMENT", label: "Appartement" },
  { value: "MAISON", label: "Maison" },
  { value: "IMMEUBLE", label: "Immeuble" },
  { value: "TERRAIN", label: "Terrain" },
  { value: "LOCAL_COMMERCIAL", label: "Local commercial" },
  { value: "AUTRE", label: "Autre" },
];
const VALUATION_KEY_FIELD_REFERENCES: Array<{
  categoryId: PropertyDetailsCategoryId;
  fieldKey: string;
}> = [
  { categoryId: "regulation", fieldKey: "dpeClass" },
  { categoryId: "characteristics", fieldKey: "standing" },
  { categoryId: "amenities", fieldKey: "pool" },
  { categoryId: "characteristics", fieldKey: "livingArea" },
  { categoryId: "characteristics", fieldKey: "landArea" },
  { categoryId: "regulation", fieldKey: "asbestos" },
  { categoryId: "characteristics", fieldKey: "hasCracks" },
  { categoryId: "characteristics", fieldKey: "hasVisAVis" },
  { categoryId: "characteristics", fieldKey: "noiseLevel" },
  { categoryId: "characteristics", fieldKey: "foundationUnderpinningDone" },
  { categoryId: "characteristics", fieldKey: "condition" },
  { categoryId: "characteristics", fieldKey: "lastRenovationYear" },
  { categoryId: "characteristics", fieldKey: "rooms" },
];

@Component({
  selector: "app-property-detail-page",
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    PropertyDetailPropertySectionComponent,
    PropertyDetailDocumentsSectionComponent,
    PropertyDetailProspectsSectionComponent,
    PropertyDetailVisitsSectionComponent,
    PropertyDetailMessagesSectionComponent,
    PropertyDetailValuationSectionComponent,
  ],
  templateUrl: "./property-detail-page.component.html",
  styleUrls: ["./property-detail-page.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertyDetailPageComponent implements OnInit, OnDestroy {
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly propertyService = inject(PropertyService);
  private readonly inseeCityService = inject(InseeCityService);
  private readonly appSettingsService = inject(AppSettingsService);
  private readonly messageService = inject(MessageService);
  private readonly fileService = inject(FileService);
  private readonly userService = inject(UserService);
  private readonly vocalService = inject(VocalService);

  readonly propertyId = this.route.snapshot.paramMap.get("id") ?? "";

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly property = signal<PropertyResponse | null>(null);
  readonly messages = signal<MessageResponse[]>([]);
  readonly files = signal<FileResponse[]>([]);
  readonly prospects = signal<PropertyProspectResponse[]>([]);
  readonly visits = signal<PropertyVisitResponse[]>([]);
  readonly risks = signal<PropertyRiskResponse | null>(null);
  readonly risksLoading = signal(false);
  readonly risksError = signal<string | null>(null);
  readonly comparables = signal<PropertyComparablesResponse | null>(null);
  readonly comparablesLoading = signal(false);
  readonly comparablesError = signal<string | null>(null);
  readonly inseeIndicators = signal<InseeCityIndicators | null>(null);
  readonly inseeLoading = signal(false);
  readonly inseeError = signal<string | null>(null);
  readonly comparableRadiusFilterM = signal<number | null>(null);
  readonly comparableSurfaceMinM2 = signal<number | null>(null);
  readonly comparableSurfaceMaxM2 = signal<number | null>(null);
  readonly comparableTerrainMinM2 = signal<number | null>(null);
  readonly comparableTerrainMaxM2 = signal<number | null>(null);
  readonly rentalMonthlyRent = signal<number | null>(null);
  readonly rentalHoldingYears = signal<number | null>(10);
  readonly rentalResalePrice = signal<number | null>(null);
  readonly latestSimilarRadiusFilterM = signal<number | null>(null);
  readonly latestSimilarSurfaceMinM2 = signal<number | null>(null);
  readonly latestSimilarSurfaceMaxM2 = signal<number | null>(null);
  readonly latestSimilarTerrainMinM2 = signal<number | null>(null);
  readonly latestSimilarTerrainMaxM2 = signal<number | null>(null);
  readonly valuationSalePriceInput = signal("");
  readonly valuationSalePriceSaving = signal(false);
  readonly valuationSalePriceFeedback = signal<string | null>(null);
  readonly valuationAgentJustificationInput = signal("");
  readonly valuationAgentOpinionSaving = signal(false);
  readonly valuationAgentOpinionFeedback = signal<string | null>(null);
  readonly valuationAiPending = signal(false);
  readonly valuationAiFeedback = signal<string | null>(null);
  readonly valuationAiPromptVisible = signal(false);
  readonly valuationAiPromptPending = signal(false);
  readonly valuationAiPromptText = signal<string | null>(null);
  readonly valuationAiResult = signal<PropertyValuationAIResponse | null>(null);
  readonly salesPage = signal(1);
  readonly comparableSalesSort = signal<ComparableSalesSortState>({
    key: "saleDate",
    direction: "desc",
  });
  readonly clients = signal<AccountUserResponse[]>([]);
  private comparablesChart: Chart<"scatter", ComparableScatterPoint[]> | null = null;
  private comparablesChartCanvas: HTMLCanvasElement | null = null;

  setComparablesChartCanvas(canvas: HTMLCanvasElement | null): void {
    this.comparablesChartCanvas = canvas;
    if (!this.comparablesChartCanvas) {
      this.destroyComparablesChart();
      return;
    }

    this.renderComparablesChart();
  }

  readonly activeMainTab = signal<MainTabId>("property");
  readonly activePropertyCategory = signal<PropertyDetailsCategoryId>(
    PROPERTY_DETAILS_CATEGORIES[0].id,
  );
  readonly activeDocumentTab = signal<DocumentTabId>(DOCUMENT_TABS[0].id);
  readonly editingPropertyCategory = signal<PropertyDetailsCategoryId | null>(null);

  readonly requestFeedback = signal<string | null>(null);
  readonly prospectFeedback = signal<string | null>(null);
  readonly uploadFeedback = signal<string | null>(null);

  readonly patchPending = signal(false);
  readonly statusPending = signal(false);
  readonly prospectPending = signal(false);
  readonly uploadPending = signal(false);
  readonly visitPending = signal(false);

  readonly uploadModalOpen = signal(false);
  readonly selectedFile = signal<File | null>(null);
  readonly vocalModalOpen = signal(false);
  readonly vocalRecording = signal(false);
  readonly vocalPending = signal(false);
  readonly vocalFeedback = signal<string | null>(null);
  readonly recordedVocal = signal<Blob | null>(null);
  readonly prospectModalOpen = signal(false);
  readonly prospectMode = signal<ProspectMode>("existing");
  readonly visitModalOpen = signal(false);
  readonly visitProspectMode = signal<VisitProspectMode>("existing");
  readonly visitFeedback = signal<string | null>(null);
  readonly clientsLoading = signal(false);
  readonly prospectSuggestionsOpen = signal(false);
  readonly visitSuggestionsOpen = signal(false);

  readonly statusLabels = STATUS_LABELS;

  readonly propertyCategories = PROPERTY_DETAILS_CATEGORIES;
  readonly documentTabs = DOCUMENT_TABS;
  readonly categoryForms = signal<Partial<CategoryForms>>({});
  readonly hiddenExpectedDocumentKeys = signal<string[]>([]);

  readonly prospectForm = this.formBuilder.nonNullable.group({
    existingLookup: [""],
    userId: [""],
    firstName: [""],
    lastName: [""],
    phone: [""],
    email: [""],
    address: [""],
    postalCode: [""],
    city: [""],
  });

  readonly uploadForm = this.formBuilder.nonNullable.group({
    typeDocument: [DEFAULT_TYPE_DOCUMENT, [Validators.required]],
  });

  readonly visitForm = this.formBuilder.nonNullable.group({
    existingLookup: [""],
    userId: [""],
    startsAt: [""],
    endsAt: [""],
    firstName: [""],
    lastName: [""],
    phone: [""],
    email: [""],
    address: [""],
    postalCode: [""],
    city: [""],
  });

  readonly activePropertyCategoryDefinition = computed<PropertyDetailsCategoryDefinition>(() => {
    return this.getPropertyCategoryDefinition(this.activePropertyCategory());
  });

  readonly activePropertyForm = computed<CategoryForm | null>(() => {
    return this.categoryForms()[this.activePropertyCategory()] ?? null;
  });

  readonly activeDocumentTabDefinition = computed<DocumentTabDefinition>(() => {
    const visibleTabs = this.visibleDocumentTabs();
    return (
      visibleTabs.find((tab) => tab.id === this.activeDocumentTab()) ??
      visibleTabs[0] ??
      this.documentTabs[0]
    );
  });

  readonly visibleDocumentTabs = computed<DocumentTabDefinition[]>(() => {
    const property = this.property();
    if (!property) {
      return [...this.documentTabs];
    }

    const isCopropriete = this.resolveIsPropertyInCopropriete(property);
    if (isCopropriete === false) {
      return this.documentTabs.filter((tab) => tab.id !== "copropriete");
    }

    return [...this.documentTabs];
  });

  readonly providedDocumentTypes = computed<Set<TypeDocument>>(() => {
    const provided = new Set<TypeDocument>();

    for (const file of this.files()) {
      if (file.typeDocument) {
        provided.add(file.typeDocument);
      }
    }

    return provided;
  });

  readonly documentsForActiveTab = computed<FileResponse[]>(() => {
    const tab = this.activeDocumentTabDefinition();

    return this.files()
      .filter((file) => {
        if (!file.typeDocument) {
          return false;
        }

        return tab.typeDocuments.includes(file.typeDocument);
      })
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  readonly expectedDocumentsForActiveTab = computed<ExpectedDocumentItem[]>(() => {
    const tab = this.activeDocumentTabDefinition();
    const hiddenExpectedDocumentKeys = new Set(this.hiddenExpectedDocumentKeys());
    const providedDocumentTypes = this.providedDocumentTypes();

    return tab.expected
      .map((label, index): ExpectedDocumentItem | null => {
        const key = this.buildExpectedDocumentKey(tab.id, index);
        if (hiddenExpectedDocumentKeys.has(key)) {
          return null;
        }

        const typeDocument = tab.typeDocuments[index] ?? null;
        return {
          key,
          index,
          label,
          typeDocument,
          provided: typeDocument !== null && providedDocumentTypes.has(typeDocument),
        };
      })
      .filter((item): item is ExpectedDocumentItem => item !== null);
  });

  readonly activeTabHasHiddenExpectedDocuments = computed<boolean>(() => {
    const tab = this.activeDocumentTabDefinition();
    return this.hasHiddenExpectedDocuments(tab.id);
  });

  readonly previousStatus = computed<PropertyStatus | null>(() => {
    const current = this.property()?.status;
    if (!current || current === "ARCHIVE") {
      return null;
    }

    const index = PROPERTY_FLOW_STATUSES.indexOf(current);
    if (index <= 0) {
      return null;
    }

    return PROPERTY_FLOW_STATUSES[index - 1] ?? null;
  });

  readonly nextStatus = computed<PropertyStatus | null>(() => {
    const current = this.property()?.status;
    if (!current || current === "ARCHIVE") {
      return null;
    }

    const index = PROPERTY_FLOW_STATUSES.indexOf(current);
    if (index < 0 || index >= PROPERTY_FLOW_STATUSES.length - 1) {
      return null;
    }

    return PROPERTY_FLOW_STATUSES[index + 1] ?? null;
  });

  readonly selectedFileName = computed(() => this.selectedFile()?.name ?? null);
  readonly recordedVocalLabel = computed(() => {
    const blob = this.recordedVocal();
    if (!blob) {
      return null;
    }

    return `Enregistrement prêt (${this.formatSize(blob.size)})`;
  });
  readonly prospectAutocompleteId = `prospect-autocomplete-${this.propertyId || "property"}`;
  readonly prospectAutocompleteListId = `prospect-autocomplete-list-${this.propertyId || "property"}`;
  readonly filteredProspectClients = computed(() => {
    const clients = this.clients();
    const lookup = this.prospectForm.controls.existingLookup.value.trim().toLowerCase();

    if (!lookup) {
      return clients.slice(0, 8);
    }

    return clients
      .filter((client) => {
        const fullName = `${client.firstName} ${client.lastName}`.trim().toLowerCase();
        const email = (client.email ?? "").toLowerCase();
        const phone = (client.phone ?? "").toLowerCase();
        return (
          fullName.includes(lookup) ||
          email.includes(lookup) ||
          phone.includes(lookup)
        );
      })
      .slice(0, 8);
  });
  readonly visitAutocompleteId = `visit-autocomplete-${this.propertyId || "property"}`;
  readonly visitAutocompleteListId = `visit-autocomplete-list-${this.propertyId || "property"}`;
  readonly filteredVisitClients = computed(() => {
    const clients = this.clients();
    const lookup = this.visitForm.controls.existingLookup.value.trim().toLowerCase();

    if (!lookup) {
      return clients.slice(0, 8);
    }

    return clients
      .filter((client) => {
        const fullName = `${client.firstName} ${client.lastName}`.trim().toLowerCase();
        const email = (client.email ?? "").toLowerCase();
        const phone = (client.phone ?? "").toLowerCase();
        return (
          fullName.includes(lookup) ||
          email.includes(lookup) ||
          phone.includes(lookup)
        );
      })
      .slice(0, 8);
  });

  readonly sortedVisits = computed(() =>
    this.visits()
      .slice()
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  );
  readonly comparableTargetSurfaceM2 = computed(() => {
    const response = this.comparables();
    if (!response) {
      return null;
    }

    return this.resolveComparableTargetSurfaceM2(response);
  });
  readonly comparableTargetLandSurfaceM2 = computed(() => {
    const response = this.comparables();
    if (!response || response.propertyType !== "MAISON") {
      return null;
    }

    return this.resolveComparableTargetLandSurfaceM2();
  });
  readonly comparablesRadiusDomain = computed(() => {
    const response = this.comparables();
    if (!response) {
      return null;
    }

    const distances = response.points
      .map((point) => point.distanceM)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

    if (distances.length > 0) {
      return {
        min: 0,
        max: this.roundComparable(Math.max(...distances)),
      };
    }

    if (Number.isFinite(response.search.finalRadiusM) && response.search.finalRadiusM > 0) {
      return {
        min: 0,
        max: this.roundComparable(response.search.finalRadiusM),
      };
    }

    return null;
  });
  readonly comparablesSurfaceDomain = computed(() => {
    const response = this.comparables();
    if (!response) {
      return null;
    }

    return this.resolveComparablesSurfaceDomain(response);
  });
  readonly comparablesSurfaceSlider = computed(() => {
    const domain = this.comparablesSurfaceDomain();
    if (!domain) {
      return null;
    }

    const currentMinRaw = this.comparableSurfaceMinM2() ?? domain.min;
    const currentMaxRaw = this.comparableSurfaceMaxM2() ?? domain.max;
    const currentMin = Math.min(Math.max(currentMinRaw, domain.min), domain.max);
    const currentMax = Math.max(Math.min(currentMaxRaw, domain.max), domain.min);
    const clampedMin = Math.min(currentMin, currentMax);
    const clampedMax = Math.max(currentMin, currentMax);
    const span = Math.max(domain.max - domain.min, 1);
    const minPercent = ((clampedMin - domain.min) / span) * 100;
    const maxPercent = ((clampedMax - domain.min) / span) * 100;

    return {
      min: domain.min,
      max: domain.max,
      currentMin: clampedMin,
      currentMax: clampedMax,
      minPercent: this.roundComparable(minPercent),
      maxPercent: this.roundComparable(maxPercent),
      rangePercent: this.roundComparable(Math.max(maxPercent - minPercent, 0)),
    };
  });
  readonly comparablesTerrainDomain = computed(() => {
    const response = this.comparables();
    if (!response || response.propertyType !== "MAISON" || response.points.length === 0) {
      return null;
    }

    const terrains = response.points
      .map((point) => point.landSurfaceM2)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

    if (terrains.length === 0) {
      return null;
    }

    return {
      min: this.roundComparable(Math.min(...terrains)),
      max: this.roundComparable(Math.max(...terrains)),
    };
  });
  readonly comparablesTerrainSlider = computed(() => {
    const domain = this.comparablesTerrainDomain();
    if (!domain) {
      return null;
    }

    const currentMinRaw = this.comparableTerrainMinM2() ?? domain.min;
    const currentMaxRaw = this.comparableTerrainMaxM2() ?? domain.max;
    const currentMin = Math.min(Math.max(currentMinRaw, domain.min), domain.max);
    const currentMax = Math.max(Math.min(currentMaxRaw, domain.max), domain.min);
    const clampedMin = Math.min(currentMin, currentMax);
    const clampedMax = Math.max(currentMin, currentMax);
    const span = Math.max(domain.max - domain.min, 1);
    const minPercent = ((clampedMin - domain.min) / span) * 100;
    const maxPercent = ((clampedMax - domain.min) / span) * 100;

    return {
      min: domain.min,
      max: domain.max,
      currentMin: clampedMin,
      currentMax: clampedMax,
      minPercent: this.roundComparable(minPercent),
      maxPercent: this.roundComparable(maxPercent),
      rangePercent: this.roundComparable(Math.max(maxPercent - minPercent, 0)),
    };
  });
  readonly filteredComparablePoints = computed(() => {
    const response = this.comparables();
    if (!response) {
      return [];
    }

    const surfaceDomain = this.comparablesSurfaceDomain();
    const surfaceMin = this.comparableSurfaceMinM2() ?? surfaceDomain?.min ?? null;
    const surfaceMax = this.comparableSurfaceMaxM2() ?? surfaceDomain?.max ?? null;
    const terrainMin = this.comparableTerrainMinM2();
    const terrainMax = this.comparableTerrainMaxM2();

    return response.points.filter((point) => {
      if (
        !Number.isFinite(point.surfaceM2) ||
        !Number.isFinite(point.salePrice) ||
        point.surfaceM2 <= 0 ||
        point.salePrice <= 0
      ) {
        return false;
      }

      const pricePerM2 = this.resolveComparablePricePerM2(point);
      if (pricePerM2 === null || pricePerM2 < MIN_COMPARABLE_PRICE_PER_M2) {
        return false;
      }

      if (surfaceMin !== null && point.surfaceM2 < surfaceMin) {
        return false;
      }

      if (surfaceMax !== null && point.surfaceM2 > surfaceMax) {
        return false;
      }

      if (response.propertyType === "MAISON" && terrainMin !== null && terrainMax !== null) {
        if (
          typeof point.landSurfaceM2 !== "number" ||
          !Number.isFinite(point.landSurfaceM2) ||
          point.landSurfaceM2 < terrainMin ||
          point.landSurfaceM2 > terrainMax
        ) {
          return false;
        }
      }

      return true;
    });
  });
  readonly chartComparablePoints = computed(() => {
    const points = this.filteredComparablePoints();
    if (points.length === 0) {
      return [];
    }

    const comparablePricePerM2Values = points
      .map((point) => this.resolveComparablePricePerM2(point))
      .filter((value): value is number => value !== null);
    if (comparablePricePerM2Values.length === 0) {
      return points;
    }

    const averagePricePerM2 =
      comparablePricePerM2Values.reduce((sum, value) => sum + value, 0) / comparablePricePerM2Values.length;
    if (!Number.isFinite(averagePricePerM2) || averagePricePerM2 <= 0) {
      return points;
    }

    const maxAllowedPricePerM2 = averagePricePerM2 * CHART_OUTLIER_PRICE_PER_M2_MULTIPLIER;
    const filteredPoints = points.filter((point) => {
      const pricePerM2 = this.resolveComparablePricePerM2(point);
      if (pricePerM2 === null) {
        return true;
      }

      return pricePerM2 <= maxAllowedPricePerM2;
    });

    return filteredPoints.length > 0 ? filteredPoints : points;
  });
  readonly filteredComparableSalesSorted = computed(() => {
    const points = this.filteredComparablePoints().slice();
    const sortState = this.comparableSalesSort();

    points.sort((a, b) => {
      const left = this.resolveComparableSalesSortValue(a, sortState.key);
      const right = this.resolveComparableSalesSortValue(b, sortState.key);

      if (left === null && right === null) {
        return 0;
      }
      if (left === null) {
        return 1;
      }
      if (right === null) {
        return -1;
      }
      if (left === right) {
        return 0;
      }

      return sortState.direction === "asc" ? left - right : right - left;
    });

    return points;
  });
  readonly salesPagination = computed(() => {
    const total = this.filteredComparableSalesSorted().length;
    const pageSize = SALES_PAGE_SIZE;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const requestedPage = this.salesPage();
    const page = Math.min(Math.max(requestedPage, 1), totalPages);
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = total === 0 ? 0 : Math.min(page * pageSize, total);

    return {
      total,
      pageSize,
      totalPages,
      page,
      from,
      to,
    };
  });
  readonly paginatedComparableSales = computed(() => {
    const sales = this.filteredComparableSalesSorted();
    const pagination = this.salesPagination();
    const offset = (pagination.page - 1) * pagination.pageSize;
    return sales.slice(offset, offset + pagination.pageSize);
  });
  readonly comparablesDisplayedSurfaceRange = computed(() => {
    const points = this.filteredComparablePoints();
    if (points.length === 0) {
      return null;
    }

    const surfaces = points
      .map((point) => point.surfaceM2)
      .filter((value): value is number => Number.isFinite(value) && value > 0);

    if (surfaces.length === 0) {
      return null;
    }

    return {
      min: this.roundComparable(Math.min(...surfaces)),
      max: this.roundComparable(Math.max(...surfaces)),
    };
  });
  readonly comparablesDisplayedSummary = computed(() => {
    const points = this.filteredComparablePoints();
    const prices = points.map((point) => point.salePrice);
    const pricePerM2Values = points.map((point) => point.pricePerM2);

    return {
      count: points.length,
      medianPrice: this.computeMedian(prices),
      medianPricePerM2: this.computeMedian(pricePerM2Values),
      minPrice: prices.length > 0 ? Math.min(...prices) : null,
      maxPrice: prices.length > 0 ? Math.max(...prices) : null,
    };
  });
  readonly marketTrendRows = computed<MarketTrendYearRow[]>(() => {
    const response = this.comparables();
    if (!response) {
      return [];
    }
    const filteredPoints = this.filteredComparablePoints();

    const saleYears = response.points
      .map((point) => this.parseComparableSaleTimestamp(point.saleDate))
      .filter((timestamp): timestamp is number => timestamp !== null)
      .map((timestamp) => new Date(timestamp).getFullYear());

    const latestYear = saleYears.length > 0 ? Math.max(...saleYears) : new Date().getFullYear();
    const years = Array.from({ length: 5 }, (_value, index) => latestYear - (4 - index));

    const byYear = new Map<number, { salesCount: number; sumPricePerM2: number; priceCount: number }>();
    for (const year of years) {
      byYear.set(year, { salesCount: 0, sumPricePerM2: 0, priceCount: 0 });
    }

    for (const point of filteredPoints) {
      const saleTimestamp = this.parseComparableSaleTimestamp(point.saleDate);
      if (saleTimestamp === null) {
        continue;
      }

      const saleYear = new Date(saleTimestamp).getFullYear();
      const bucket = byYear.get(saleYear);
      if (!bucket) {
        continue;
      }

      bucket.salesCount += 1;
      const pricePerM2 = this.resolveComparablePricePerM2(point);
      if (pricePerM2 !== null) {
        bucket.sumPricePerM2 += pricePerM2;
        bucket.priceCount += 1;
      }
    }

    return years.map((year, index) => {
      const current = byYear.get(year) ?? { salesCount: 0, sumPricePerM2: 0, priceCount: 0 };
      const previous = byYear.get(year - 1) ?? { salesCount: 0, sumPricePerM2: 0, priceCount: 0 };
      const avgPricePerM2 =
        current.priceCount > 0 ? this.roundComparable(current.sumPricePerM2 / current.priceCount) : null;
      const previousAvgPricePerM2 =
        previous.priceCount > 0 ? previous.sumPricePerM2 / previous.priceCount : null;

      return {
        year,
        salesCount: current.salesCount,
        avgPricePerM2,
        salesCountVariationPct:
          index > 0 && previous.salesCount > 0
            ? this.roundComparable(
                ((current.salesCount - previous.salesCount) / previous.salesCount) * 100,
              )
            : null,
        avgPricePerM2VariationPct:
          index > 0 &&
          avgPricePerM2 !== null &&
          previousAvgPricePerM2 !== null &&
          previousAvgPricePerM2 > 0
            ? this.roundComparable(((avgPricePerM2 - previousAvgPricePerM2) / previousAvgPricePerM2) * 100)
            : null,
      };
    });
  });
  readonly marketTrendSalesCount = computed(() =>
    this.marketTrendRows().reduce((sum, row) => sum + row.salesCount, 0),
  );
  readonly comparablesFrontRegression = computed(() =>
    computeComparablesRegression(
      this.filteredComparablePoints().map((point) => ({
        surfaceM2: point.surfaceM2,
        salePrice: point.salePrice,
      })),
    ),
  );
  readonly chartComparableRegression = computed(() =>
    computeComparablesRegression(
      this.chartComparablePoints().map((point) => ({
        surfaceM2: point.surfaceM2,
        salePrice: point.salePrice,
      })),
    ),
  );
  readonly comparablesFrontPricing = computed(() => {
    const response = this.comparables();
    if (!response) {
      return null;
    }

    const askingPrice = response.subject.askingPrice;
    const regression = this.comparablesFrontRegression();
    const predictedPrice = this.computePredictedComparablePrice({
      surfaceM2: response.subject.surfaceM2,
      slope: regression.slope,
      intercept: regression.intercept,
    });

    if (
      typeof askingPrice !== "number" ||
      !Number.isFinite(askingPrice) ||
      askingPrice <= 0 ||
      predictedPrice === null
    ) {
      return {
        predictedPrice,
        deviationPct: null,
        pricingPosition: "UNKNOWN" as const,
      };
    }

    const deviation = (askingPrice - predictedPrice) / predictedPrice;
    const deviationPct = this.roundComparable(deviation * 100);

    if (deviation < -FRONT_COMPARABLE_PRICE_TOLERANCE) {
      return {
        predictedPrice,
        deviationPct,
        pricingPosition: "UNDER_PRICED" as const,
      };
    }

    if (deviation > FRONT_COMPARABLE_PRICE_TOLERANCE) {
      return {
        predictedPrice,
        deviationPct,
        pricingPosition: "OVER_PRICED" as const,
      };
    }

    return {
      predictedPrice,
      deviationPct,
      pricingPosition: "NORMAL" as const,
    };
  });
  readonly valuationKeyCriteria = computed<ValuationKeyCriterion[]>(() => {
    const property = this.property();
    if (!property) {
      return [];
    }

    const criteria: ValuationKeyCriterion[] = [];

    for (const reference of VALUATION_KEY_FIELD_REFERENCES) {
      const field = this.findCategoryFieldDefinition(reference.categoryId, reference.fieldKey);
      if (!field) {
        continue;
      }

      const rawValue = this.getFieldRawValue(property, reference.categoryId, field);
      if (this.isFieldValueEmpty(rawValue)) {
        continue;
      }

      const value = this.fieldDisplayValue(reference.categoryId, field);
      if (!value || value === "Non renseigné") {
        continue;
      }

      criteria.push({
        categoryId: reference.categoryId,
        field,
        value,
      });
    }

    return criteria.slice(0, 5);
  });
  readonly valuationAiSnapshot = computed<PropertyValuationAIResponse | null>(() => {
    const inMemory = this.valuationAiResult();
    if (inMemory) {
      return inMemory;
    }

    return this.readValuationAiSnapshotFromProperty(this.property());
  });
  readonly valuationAiJustificationHtml = computed(() => {
    const justification = this.valuationAiSnapshot()?.valuationJustification ?? "";
    if (!justification.trim()) {
      return "";
    }

    const rendered = marked.parse(justification, {
      gfm: true,
      breaks: true,
      async: false,
    });

    return typeof rendered === "string" ? rendered : "";
  });
  readonly rentalProfitability = computed<RentalProfitabilityResult>(() => {
    const monthlyRent = this.rentalMonthlyRent();
    const holdingYears = this.rentalHoldingYears();
    const resalePrice = this.rentalResalePrice();
    const purchasePrice = this.resolveRentalPurchasePrice();
    const notaryFeePct = this.appSettingsService.notaryFeePct();
    const annualPropertyTax = this.resolveRentalAnnualPropertyTax();
    const annualCoproFees = this.resolveRentalAnnualCoproFees();
    return computeRentalProfitability({
      purchasePrice,
      notaryFeePct,
      annualPropertyTax,
      annualCoproFees,
      monthlyRent,
      holdingYears,
      resalePrice,
    });
  });
  readonly inseeModule = computed(() => {
    const indicators = this.inseeIndicators();
    if (indicators) {
      return indicators;
    }

    const riskLocation = this.risks()?.location;
    const property = this.property();
    return {
      inseeCode: riskLocation?.inseeCode ?? null,
      city: riskLocation?.city ?? property?.city ?? null,
      postalCode: riskLocation?.postalCode ?? property?.postalCode ?? null,
      populationCurrent: null,
      populationCurrentYear: null,
      populationGrowthPct: null,
      populationGrowthAbs: null,
      populationStartYear: null,
      populationEndYear: null,
      populationDensityPerKm2: null,
      medianIncome: null,
      medianIncomeYear: null,
      ownersRatePct: null,
      ownersRateYear: null,
      ownersRateScope: null,
      unemploymentRatePct: null,
      unemploymentYear: null,
      averageAge: null,
      averageAgeYear: null,
      povertyRatePct: null,
      giniIndex: null,
    };
  });
  readonly latestSimilarComparableSalesCriteria = computed(() => {
    const response = this.comparables();
    if (!response) {
      return null;
    }

    const targetSurfaceM2 = this.resolveComparableTargetSurfaceM2(response);
    if (targetSurfaceM2 === null) {
      return null;
    }

    const minSurfaceM2 = this.roundComparable(targetSurfaceM2 * 0.95);
    const maxSurfaceM2 = this.roundComparable(targetSurfaceM2 * 1.05);
    const isHouse = response.propertyType === "MAISON";
    const targetLandSurfaceM2 = isHouse ? this.resolveComparableTargetLandSurfaceM2() : null;

    return {
      isHouse,
      targetSurfaceM2,
      minSurfaceM2,
      maxSurfaceM2,
      targetLandSurfaceM2,
      minLandSurfaceM2:
        targetLandSurfaceM2 === null ? null : this.roundComparable(targetLandSurfaceM2 * 0.8),
      maxLandSurfaceM2:
        targetLandSurfaceM2 === null ? null : this.roundComparable(targetLandSurfaceM2 * 1.2),
    };
  });
  readonly latestSimilarRadiusSlider = computed(() => {
    const domain = this.comparablesRadiusDomain();
    if (!domain) {
      return null;
    }

    const currentRaw = this.latestSimilarRadiusFilterM() ?? domain.max;
    const current = Math.min(Math.max(currentRaw, domain.min), domain.max);

    return {
      min: domain.min,
      max: domain.max,
      current: this.roundComparable(current),
    };
  });
  readonly latestSimilarSurfaceSlider = computed(() => {
    const domain = this.comparablesSurfaceDomain();
    const criteria = this.latestSimilarComparableSalesCriteria();
    if (!domain || !criteria) {
      return null;
    }

    const defaultMin = Math.min(Math.max(criteria.minSurfaceM2, domain.min), domain.max);
    const defaultMax = Math.max(Math.min(criteria.maxSurfaceM2, domain.max), domain.min);
    const currentMinRaw = this.latestSimilarSurfaceMinM2() ?? defaultMin;
    const currentMaxRaw = this.latestSimilarSurfaceMaxM2() ?? defaultMax;
    const currentMin = Math.min(Math.max(currentMinRaw, domain.min), domain.max);
    const currentMax = Math.max(Math.min(currentMaxRaw, domain.max), domain.min);
    const clampedMin = Math.min(currentMin, currentMax);
    const clampedMax = Math.max(currentMin, currentMax);
    const span = Math.max(domain.max - domain.min, 1);
    const minPercent = ((clampedMin - domain.min) / span) * 100;
    const maxPercent = ((clampedMax - domain.min) / span) * 100;

    return {
      min: domain.min,
      max: domain.max,
      currentMin: clampedMin,
      currentMax: clampedMax,
      minPercent: this.roundComparable(minPercent),
      maxPercent: this.roundComparable(maxPercent),
      rangePercent: this.roundComparable(Math.max(maxPercent - minPercent, 0)),
    };
  });
  readonly latestSimilarTerrainSlider = computed(() => {
    const domain = this.comparablesTerrainDomain();
    const criteria = this.latestSimilarComparableSalesCriteria();
    if (!domain || !criteria || !criteria.isHouse || criteria.targetLandSurfaceM2 === null) {
      return null;
    }

    const rawDefaultMin = criteria.minLandSurfaceM2;
    const rawDefaultMax = criteria.maxLandSurfaceM2;
    if (rawDefaultMin === null || rawDefaultMax === null) {
      return null;
    }

    const defaultMin = Math.min(Math.max(rawDefaultMin, domain.min), domain.max);
    const defaultMax = Math.max(Math.min(rawDefaultMax, domain.max), domain.min);
    const currentMinRaw = this.latestSimilarTerrainMinM2() ?? defaultMin;
    const currentMaxRaw = this.latestSimilarTerrainMaxM2() ?? defaultMax;
    const currentMin = Math.min(Math.max(currentMinRaw, domain.min), domain.max);
    const currentMax = Math.max(Math.min(currentMaxRaw, domain.max), domain.min);
    const clampedMin = Math.min(currentMin, currentMax);
    const clampedMax = Math.max(currentMin, currentMax);
    const span = Math.max(domain.max - domain.min, 1);
    const minPercent = ((clampedMin - domain.min) / span) * 100;
    const maxPercent = ((clampedMax - domain.min) / span) * 100;

    return {
      min: domain.min,
      max: domain.max,
      currentMin: clampedMin,
      currentMax: clampedMax,
      minPercent: this.roundComparable(minPercent),
      maxPercent: this.roundComparable(maxPercent),
      rangePercent: this.roundComparable(Math.max(maxPercent - minPercent, 0)),
    };
  });
  readonly latestSimilarComparableSales = computed(() => {
    const response = this.comparables();
    const criteria = this.latestSimilarComparableSalesCriteria();
    const surfaceSlider = this.latestSimilarSurfaceSlider();
    const terrainSlider = this.latestSimilarTerrainSlider();
    if (!response || !criteria || !surfaceSlider) {
      return [];
    }

    const surfaceMin = surfaceSlider.currentMin;
    const surfaceMax = surfaceSlider.currentMax;
    const terrainMin = terrainSlider?.currentMin ?? null;
    const terrainMax = terrainSlider?.currentMax ?? null;

    return response.points
      .filter((point) => {
        if (
          !Number.isFinite(point.surfaceM2) ||
          !Number.isFinite(point.salePrice) ||
          !Number.isFinite(point.pricePerM2) ||
          point.surfaceM2 <= 0 ||
          point.salePrice <= 0
        ) {
          return false;
        }

        if (point.surfaceM2 < surfaceMin || point.surfaceM2 > surfaceMax) {
          return false;
        }

        if (!criteria.isHouse || criteria.targetLandSurfaceM2 === null) {
          return true;
        }

        if (
          typeof point.landSurfaceM2 !== "number" ||
          !Number.isFinite(point.landSurfaceM2) ||
          point.landSurfaceM2 <= 0 ||
          terrainMin === null ||
          terrainMax === null
        ) {
          return false;
        }

        return point.landSurfaceM2 >= terrainMin && point.landSurfaceM2 <= terrainMax;
      })
      .map((point) => ({
        point,
        saleTimestamp: this.parseComparableSaleTimestamp(point.saleDate),
      }))
      .filter(
        (
          entry,
        ): entry is {
          point: PropertyComparablesResponse["points"][number];
          saleTimestamp: number;
        } => entry.saleTimestamp !== null,
      )
      .sort((a, b) => b.saleTimestamp - a.saleTimestamp)
      .slice(0, 5)
      .map((entry) => entry.point);
  });
  readonly comparablesChartDomains = computed(() => {
    const response = this.comparables();
    const points = this.chartComparablePoints();
    if (!response || points.length === 0) {
      return null;
    }

    const xValues = points.map((point) => point.surfaceM2);
    const yValues = points.map((point) => point.salePrice);
    const subjectPoint = this.resolveSubjectPointForChart(response);
    if (subjectPoint) {
      const subjectX =
        typeof subjectPoint.x === "number" && Number.isFinite(subjectPoint.x) ? subjectPoint.x : null;
      const subjectY =
        typeof subjectPoint.y === "number" && Number.isFinite(subjectPoint.y) ? subjectPoint.y : null;
      if (subjectX !== null && subjectY !== null) {
        xValues.push(subjectX);
        yValues.push(subjectY);
      }
    }
    const regression = this.chartComparableRegression();

    let minX = Math.min(...xValues);
    let maxX = Math.max(...xValues);
    let minY = Math.min(...yValues);
    let maxY = Math.max(...yValues);

    if (
      regression.slope !== null &&
      Number.isFinite(regression.slope) &&
      regression.intercept !== null &&
      Number.isFinite(regression.intercept)
    ) {
      const yAtMinX = regression.slope * minX + regression.intercept;
      const yAtMaxX = regression.slope * maxX + regression.intercept;
      if (Number.isFinite(yAtMinX)) {
        minY = Math.min(minY, yAtMinX);
      }
      if (Number.isFinite(yAtMaxX)) {
        maxY = Math.max(maxY, yAtMaxX);
      }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
      return null;
    }

    if (minX === maxX) {
      minX -= 1;
      maxX += 1;
    }

    if (minY === maxY) {
      minY -= 1000;
      maxY += 1000;
    }

    const xSpan = Math.max(maxX - minX, 1);
    const ySpan = Math.max(maxY - minY, 1000);
    const xPadding = Math.max(xSpan * 0.05, 1);
    const yPadding = Math.max(ySpan * 0.05, 1000);

    return {
      xDomain: {
        min: this.roundComparable(minX - xPadding),
        max: this.roundComparable(maxX + xPadding),
      },
      yDomain: {
        min: this.roundComparable(minY - yPadding),
        max: this.roundComparable(maxY + yPadding),
      },
    };
  });

  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private recordedChunks: BlobPart[] = [];
  private hiddenExpectedDocumentKeysPersistQueue: Promise<void> = Promise.resolve();
  private rentalInputsPersistQueue: Promise<void> = Promise.resolve();
  private comparableFiltersPersistQueue: Promise<void> = Promise.resolve();
  private comparableFiltersPersistDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private didInitialValuationComparablesRefresh = false;

  ngOnInit(): void {
    this.applyProspectModeConstraints(this.prospectMode());

    if (!this.propertyId) {
      this.loading.set(false);
      this.error.set("Identifiant du bien manquant.");
      return;
    }

    void this.loadPropertyBundle();
  }

  ngOnDestroy(): void {
    if (this.comparableFiltersPersistDebounceTimer !== null) {
      clearTimeout(this.comparableFiltersPersistDebounceTimer);
      this.comparableFiltersPersistDebounceTimer = null;
    }
    this.destroyComparablesChart();
    this.stopRecorderTracks();
  }

  async loadPropertyBundle(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.risks.set(null);
    this.risksError.set(null);
    this.risksLoading.set(false);
    this.comparables.set(null);
    this.comparablesError.set(null);
    this.comparablesLoading.set(false);
    this.inseeIndicators.set(null);
    this.inseeError.set(null);
    this.inseeLoading.set(false);
    this.comparableRadiusFilterM.set(null);
    this.comparableSurfaceMinM2.set(null);
    this.comparableSurfaceMaxM2.set(null);
    this.comparableTerrainMinM2.set(null);
    this.comparableTerrainMaxM2.set(null);
    this.rentalMonthlyRent.set(null);
    this.rentalHoldingYears.set(10);
    this.rentalResalePrice.set(null);
    this.latestSimilarRadiusFilterM.set(null);
    this.latestSimilarSurfaceMinM2.set(null);
    this.latestSimilarSurfaceMaxM2.set(null);
    this.latestSimilarTerrainMinM2.set(null);
    this.latestSimilarTerrainMaxM2.set(null);
    this.valuationSalePriceInput.set("");
    this.valuationSalePriceFeedback.set(null);
    this.valuationAgentJustificationInput.set("");
    this.valuationAgentOpinionSaving.set(false);
    this.valuationAgentOpinionFeedback.set(null);
    this.valuationAiResult.set(null);
    this.valuationAiFeedback.set(null);
    this.valuationAiPromptVisible.set(false);
    this.valuationAiPromptPending.set(false);
    this.valuationAiPromptText.set(null);
    this.salesPage.set(1);
    this.hiddenExpectedDocumentKeys.set([]);
    this.destroyComparablesChart();
    this.didInitialValuationComparablesRefresh = false;

    try {
      const [property, messagesResponse, filesResponse, prospectsResponse, visitsResponse] =
        await Promise.all([
          this.propertyService.getById(this.propertyId),
          this.messageService.listByProperty(this.propertyId, 100),
          this.fileService.listByProperty(this.propertyId, 100),
          this.propertyService.listProspects(this.propertyId),
          this.propertyService.listVisits(this.propertyId),
        ]);

      this.property.set(property);
      this.valuationSalePriceInput.set(this.resolveValuationSalePriceInput(property));
      this.valuationAgentJustificationInput.set(this.resolveValuationAgentJustificationInput(property));
      this.hiddenExpectedDocumentKeys.set(
        this.normalizeHiddenExpectedDocumentKeys(property.hiddenExpectedDocumentKeys),
      );
      this.initializeRentalProfitabilityInputs(property);
      this.messages.set(messagesResponse.items);
      this.files.set(filesResponse.items);
      this.prospects.set(prospectsResponse.items);
      this.visits.set(visitsResponse.items);
      this.categoryForms.set(this.createCategoryForms(property));
      void this.loadPropertyRisks();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chargement impossible.";
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  setMainTab(tab: MainTabId): void {
    this.activeMainTab.set(tab);

    if (tab === "valuation") {
      const shouldForceRefresh = !this.didInitialValuationComparablesRefresh;
      if (!this.comparablesLoading() && (shouldForceRefresh || !this.comparables())) {
        this.didInitialValuationComparablesRefresh = true;
        void this.loadPropertyComparables({
          forceRefresh: shouldForceRefresh,
        });
      }
      if (!this.inseeIndicators() && !this.inseeLoading()) {
        void this.loadInseeIndicators();
      }
    }
  }

  isMainTabActive(tab: MainTabId): boolean {
    return this.activeMainTab() === tab;
  }

  setActivePropertyCategory(categoryId: PropertyDetailsCategoryId): void {
    this.activePropertyCategory.set(categoryId);
    this.editingPropertyCategory.set(null);
  }

  isActivePropertyCategory(categoryId: PropertyDetailsCategoryId): boolean {
    return this.activePropertyCategory() === categoryId;
  }

  startEditingActiveCategory(): void {
    this.editingPropertyCategory.set(this.activePropertyCategory());
  }

  cancelEditingActiveCategory(): void {
    const property = this.property();
    if (!property) {
      return;
    }

    this.categoryForms.set(this.createCategoryForms(property));
    this.editingPropertyCategory.set(null);
  }

  isEditingActiveCategory(): boolean {
    return this.editingPropertyCategory() === this.activePropertyCategory();
  }

  shouldDisplayPropertyField(
    categoryId: PropertyDetailsCategoryId,
    field: PropertyDetailsFieldDefinition,
  ): boolean {
    if (categoryId === "characteristics" && field.key === "septicTankCompliant") {
      return this.resolveCurrentSanitationType() === "FOSSE_SEPTIQUE";
    }

    if (categoryId === "amenities" && field.key === "fenced") {
      return this.resolveCurrentPropertyType() === "MAISON";
    }

    return true;
  }

  async saveActivePropertyCategory(): Promise<void> {
    const property = this.property();
    const category = this.activePropertyCategoryDefinition();
    const form = this.activePropertyForm();

    if (!property || !form || this.patchPending()) {
      return;
    }

    const patchPayload: PropertyPatchRequest = {};
    const categoryDetailsPayload: Record<string, unknown> = {};

    for (const field of category.fields) {
      const rawValue = form.controls[field.key]?.value ?? "";
      let parsedValue: unknown;

      try {
        parsedValue = this.parseFieldFormValue(rawValue, field);
      } catch {
        this.requestFeedback.set(`Le champ \"${field.label}\" doit être un nombre valide.`);
        return;
      }

      if (field.source === "property") {
        if (typeof parsedValue !== "string" || !parsedValue.trim()) {
          this.requestFeedback.set(`Le champ \"${field.label}\" est obligatoire.`);
          return;
        }

        this.assignPropertyPatchValue(patchPayload, field.key, parsedValue.trim());
        continue;
      }

      categoryDetailsPayload[field.key] = parsedValue;
    }

    if (category.id === "characteristics") {
      const sanitationTypeRaw = categoryDetailsPayload["sanitationType"];
      const sanitationType =
        typeof sanitationTypeRaw === "string" ? sanitationTypeRaw.trim().toUpperCase() : "";
      if (sanitationType !== "FOSSE_SEPTIQUE") {
        categoryDetailsPayload["septicTankCompliant"] = null;
      }
    }

    patchPayload.details = {
      [category.id]: categoryDetailsPayload,
    };

    this.patchPending.set(true);
    this.requestFeedback.set("Mise à jour des informations en cours...");

    try {
      const updated = await this.propertyService.patch(this.propertyId, patchPayload);
      this.property.set(updated);
      this.categoryForms.set(this.createCategoryForms(updated));
      this.editingPropertyCategory.set(null);
      this.requestFeedback.set("Informations mises à jour.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mise à jour impossible.";
      this.requestFeedback.set(message);
    } finally {
      this.patchPending.set(false);
    }
  }

  fieldDisplayValue(
    categoryId: PropertyDetailsCategoryId,
    field: PropertyDetailsFieldDefinition,
  ): string {
    const property = this.property();
    if (!property) {
      return "Non renseigné";
    }

    const rawValue = this.getFieldRawValue(property, categoryId, field);

    if (rawValue === null || typeof rawValue === "undefined" || rawValue === "") {
      return "Non renseigné";
    }

    if (field.type === "boolean") {
      if (typeof rawValue === "boolean") {
        return rawValue ? "Oui" : "Non";
      }

      if (typeof rawValue === "string") {
        const normalized = rawValue.trim().toLowerCase();
        if (normalized === "true") {
          return "Oui";
        }
        if (normalized === "false") {
          return "Non";
        }
      }
    }

    if (field.type === "select") {
      const normalizedRaw = String(rawValue);
      const option = field.options?.find((item) => item.value === normalizedRaw);
      if (option) {
        return option.label;
      }

      const normalizedBoolean = normalizedRaw.trim().toLowerCase();
      if ((field.key === "pool" || field.key === "garden") && normalizedBoolean === "true") {
        return "Oui";
      }
      if ((field.key === "pool" || field.key === "garden") && normalizedBoolean === "false") {
        return "Non";
      }

      return normalizedRaw;
    }

    if (field.type === "number") {
      if (typeof rawValue === "number") {
        return new Intl.NumberFormat("fr-FR").format(rawValue);
      }

      const parsed = Number(String(rawValue).replace(",", "."));
      if (!Number.isNaN(parsed)) {
        return new Intl.NumberFormat("fr-FR").format(parsed);
      }
    }

    if (field.type === "date") {
      const rawString = String(rawValue);
      return rawString.length >= 10 ? rawString.slice(0, 10) : rawString;
    }

    return String(rawValue);
  }

  hasFieldValue(
    categoryId: PropertyDetailsCategoryId,
    field: PropertyDetailsFieldDefinition,
  ): boolean {
    const property = this.property();
    if (!property) {
      return false;
    }

    const rawValue = this.getFieldRawValue(property, categoryId, field);
    return !this.isFieldValueEmpty(rawValue);
  }

  private resolveCurrentSanitationType(): string {
    const property = this.property();
    if (!property) {
      return "";
    }

    if (this.isEditingActiveCategory() && this.activePropertyCategory() === "characteristics") {
      const form = this.activePropertyForm();
      const rawValue = form?.controls["sanitationType"]?.value;
      return typeof rawValue === "string" ? rawValue.trim().toUpperCase() : "";
    }

    const characteristics = this.getCategoryDetails(property, "characteristics");
    const rawValue = characteristics["sanitationType"];
    return typeof rawValue === "string" ? rawValue.trim().toUpperCase() : "";
  }

  private resolveCurrentPropertyType(): string {
    const property = this.property();
    if (!property) {
      return "";
    }

    if (this.isEditingActiveCategory() && this.activePropertyCategory() === "general") {
      const form = this.activePropertyForm();
      const rawValue = form?.controls["propertyType"]?.value;
      return typeof rawValue === "string" ? rawValue.trim().toUpperCase() : "";
    }

    const general = this.getCategoryDetails(property, "general");
    const rawValue = general["propertyType"];
    return typeof rawValue === "string" ? rawValue.trim().toUpperCase() : "";
  }

  async updateStatus(status: PropertyStatus): Promise<void> {
    if (this.statusPending()) {
      return;
    }

    this.statusPending.set(true);
    this.requestFeedback.set("Mise à jour du statut en cours...");

    try {
      const updated = await this.propertyService.updateStatus(this.propertyId, status);
      this.property.set(updated);
      this.requestFeedback.set(`Statut mis à jour: ${this.statusLabels[updated.status]}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mise à jour impossible.";
      this.requestFeedback.set(message);
    } finally {
      this.statusPending.set(false);
    }
  }

  async goToPreviousStatus(): Promise<void> {
    const status = this.previousStatus();
    if (!status) {
      return;
    }

    await this.updateStatus(status);
  }

  async goToNextStatus(): Promise<void> {
    const status = this.nextStatus();
    if (!status) {
      return;
    }

    await this.updateStatus(status);
  }

  async archiveProperty(): Promise<void> {
    await this.updateStatus("ARCHIVE");
  }

  setActiveDocumentTab(tabId: DocumentTabId): void {
    const tab = this.visibleDocumentTabs().find((item) => item.id === tabId);
    if (!tab) {
      return;
    }

    this.activeDocumentTab.set(tab.id);

    const currentType = this.uploadForm.controls.typeDocument.value;

    if (!tab.typeDocuments.includes(currentType)) {
      this.uploadForm.controls.typeDocument.setValue(tab.typeDocuments[0] ?? DEFAULT_TYPE_DOCUMENT);
    }
  }

  isActiveDocumentTab(tabId: DocumentTabId): boolean {
    return this.activeDocumentTabDefinition().id === tabId;
  }

  documentTabProgressLabel(tab: DocumentTabDefinition): string {
    const providedDocumentTypes = this.providedDocumentTypes();
    const hiddenExpectedDocumentKeys = new Set(this.hiddenExpectedDocumentKeys());
    const visibleTypeDocuments = new Set<TypeDocument>();
    let providedCount = 0;
    let totalCount = 0;

    for (let index = 0; index < tab.expected.length; index += 1) {
      const key = this.buildExpectedDocumentKey(tab.id, index);
      if (hiddenExpectedDocumentKeys.has(key)) {
        continue;
      }

      const typeDocument = tab.typeDocuments[index] ?? null;
      if (!typeDocument) {
        totalCount += 1;
        continue;
      }

      if (visibleTypeDocuments.has(typeDocument)) {
        continue;
      }

      visibleTypeDocuments.add(typeDocument);
      totalCount += 1;
      if (providedDocumentTypes.has(typeDocument)) {
        providedCount += 1;
      }
    }

    return `${providedCount}/${totalCount}`;
  }

  hideExpectedDocument(tabId: DocumentTabId, expectedIndex: number): void {
    const tab = this.getDocumentTabDefinition(tabId);
    if (expectedIndex < 0 || expectedIndex >= tab.expected.length) {
      return;
    }

    const key = this.buildExpectedDocumentKey(tabId, expectedIndex);
    const currentKeys = this.hiddenExpectedDocumentKeys();
    if (currentKeys.includes(key)) {
      return;
    }

    const nextKeys = [...currentKeys, key];
    this.hiddenExpectedDocumentKeys.set(nextKeys);
    this.enqueueHiddenExpectedDocumentKeysPersist(nextKeys);
  }

  restoreHiddenExpectedDocumentsForTab(tabId: DocumentTabId): void {
    const prefix = `${tabId}${EXPECTED_DOCUMENT_HIDDEN_KEY_SEPARATOR}`;
    const currentKeys = this.hiddenExpectedDocumentKeys();
    const nextKeys = currentKeys.filter((key) => !key.startsWith(prefix));
    if (nextKeys.length === currentKeys.length) {
      return;
    }

    this.hiddenExpectedDocumentKeys.set(nextKeys);
    this.enqueueHiddenExpectedDocumentKeysPersist(nextKeys);
  }

  openUploadModal(): void {
    const tab = this.activeDocumentTabDefinition();
    this.uploadForm.controls.typeDocument.setValue(tab.typeDocuments[0] ?? DEFAULT_TYPE_DOCUMENT);
    this.selectedFile.set(null);
    this.uploadFeedback.set(null);
    this.uploadModalOpen.set(true);
  }

  closeUploadModal(): void {
    this.uploadModalOpen.set(false);
    this.selectedFile.set(null);
  }

  onUploadBackdropClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    this.closeUploadModal();
  }

  onFileInputChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const file = target.files?.[0] ?? null;
    this.selectedFile.set(file);
  }

  async uploadFile(): Promise<void> {
    if (this.uploadPending()) {
      return;
    }

    const selectedFile = this.selectedFile();
    if (!selectedFile) {
      this.uploadFeedback.set("Veuillez sélectionner un fichier.");
      return;
    }

    this.uploadPending.set(true);
    this.uploadFeedback.set("Upload du document en cours...");

    try {
      const typeDocument = this.uploadForm.controls.typeDocument.value;
      const contentBase64 = await this.fileToBase64(selectedFile);
      const uploaded = await this.fileService.upload({
        propertyId: this.propertyId,
        typeDocument,
        fileName: selectedFile.name,
        mimeType: selectedFile.type || "application/octet-stream",
        size: selectedFile.size,
        contentBase64,
      });

      this.files.update((items) => [uploaded, ...items]);
      this.closeUploadModal();
      this.uploadFeedback.set("Document ajouté.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload impossible.";
      this.uploadFeedback.set(message);
    } finally {
      this.uploadPending.set(false);
    }
  }

  openVocalModal(): void {
    this.recordedVocal.set(null);
    this.vocalFeedback.set(null);
    this.vocalModalOpen.set(true);
  }

  closeVocalModal(force = false): void {
    if (!force && this.vocalPending()) {
      return;
    }

    if (this.vocalRecording()) {
      this.stopVocalRecording();
    } else {
      this.stopRecorderTracks();
    }

    this.vocalModalOpen.set(false);
  }

  onVocalBackdropClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    this.closeVocalModal();
  }

  async startVocalRecording(): Promise<void> {
    if (this.vocalRecording()) {
      return;
    }

    if (!this.isAudioRecordingSupported()) {
      this.vocalFeedback.set("Votre navigateur ne supporte pas l'enregistrement audio.");
      return;
    }

    this.vocalFeedback.set("Initialisation du micro...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      this.stopRecorderTracks();
      this.mediaStream = stream;
      this.recordedChunks = [];
      this.recordedVocal.set(null);

      this.mediaRecorder = new MediaRecorder(stream, { mimeType: preferredMimeType });
      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || "audio/webm";
        this.recordedVocal.set(new Blob(this.recordedChunks, { type: mimeType }));
        this.vocalRecording.set(false);
        this.stopRecorderTracks();
        this.vocalFeedback.set("Enregistrement terminé.");
      };

      this.mediaRecorder.start();
      this.vocalRecording.set(true);
      this.vocalFeedback.set("Enregistrement en cours...");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Accès micro impossible.";
      this.vocalFeedback.set(message);
      this.stopRecorderTracks();
      this.vocalRecording.set(false);
    }
  }

  stopVocalRecording(): void {
    if (!this.mediaRecorder) {
      return;
    }

    if (this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
      return;
    }

    this.vocalRecording.set(false);
    this.stopRecorderTracks();
  }

  clearRecordedVocal(): void {
    this.recordedVocal.set(null);
    this.vocalFeedback.set(null);
  }

  async uploadVocalRecording(): Promise<void> {
    if (this.vocalPending()) {
      return;
    }

    const blob = this.recordedVocal();
    if (!blob) {
      this.vocalFeedback.set("Enregistrez un vocal avant l'envoi.");
      return;
    }

    this.vocalPending.set(true);
    this.vocalFeedback.set("Envoi du vocal...");

    try {
      const contentBase64 = await this.blobToBase64(blob);
      await this.vocalService.upload({
        propertyId: this.propertyId,
        fileName: `vocal-${Date.now()}.webm`,
        mimeType: blob.type || "audio/webm",
        size: blob.size,
        contentBase64,
      });

      this.closeVocalModal(true);
      this.requestFeedback.set("Vocal ajouté. Transcription en file d'attente.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload vocal impossible.";
      this.vocalFeedback.set(message);
    } finally {
      this.vocalPending.set(false);
    }
  }

  openProspectModal(): void {
    this.prospectMode.set("existing");
    this.applyProspectModeConstraints("existing");
    this.prospectForm.reset({
      existingLookup: "",
      userId: "",
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      address: "",
      postalCode: "",
      city: "",
    });
    this.prospectSuggestionsOpen.set(false);
    this.prospectFeedback.set(null);
    this.prospectModalOpen.set(true);

    if (this.clients().length === 0) {
      void this.loadClientOptions();
    }
  }

  closeProspectModal(): void {
    this.prospectModalOpen.set(false);
    this.prospectSuggestionsOpen.set(false);
  }

  onProspectBackdropClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    this.closeProspectModal();
  }

  setProspectMode(mode: ProspectMode): void {
    this.prospectMode.set(mode);
    this.prospectForm.controls.userId.setValue("");
    this.prospectSuggestionsOpen.set(false);
    this.prospectFeedback.set(null);
    this.applyProspectModeConstraints(mode);
  }

  prospectOptionLabel(client: AccountUserResponse): string {
    const fullName = `${client.firstName} ${client.lastName}`.trim() || "Sans nom";
    const contact = client.email ?? client.phone ?? "Sans contact";
    return `${fullName} - ${contact}`;
  }

  onProspectLookupInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    this.applyProspectLookupValue(target.value);
    this.prospectSuggestionsOpen.set(true);
  }

  onProspectLookupFocus(): void {
    this.prospectSuggestionsOpen.set(true);
  }

  onProspectLookupContainerFocusOut(event: FocusEvent, container: HTMLElement): void {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && container.contains(relatedTarget)) {
      return;
    }

    this.prospectSuggestionsOpen.set(false);
  }

  onProspectSuggestionMouseDown(event: MouseEvent): void {
    event.preventDefault();
  }

  toggleProspectSuggestions(): void {
    this.prospectSuggestionsOpen.update((isOpen) => !isOpen);
  }

  selectProspectClient(client: AccountUserResponse): void {
    this.prospectForm.controls.existingLookup.setValue(this.prospectOptionLabel(client));
    this.prospectForm.controls.userId.setValue(client.id);
    this.prospectSuggestionsOpen.set(false);
  }

  async addProspect(): Promise<void> {
    if (this.prospectPending()) {
      return;
    }

    const mode = this.prospectMode();
    this.prospectPending.set(true);
    this.prospectFeedback.set("Ajout du prospect en cours...");

    try {
      let created: PropertyProspectResponse;

      if (mode === "existing") {
        const client = this.resolveSelectedProspectClient();

        if (!client) {
          this.prospectFeedback.set(
            "Sélectionnez un client existant dans la liste d'autocomplétion.",
          );
          return;
        }

        created = await this.propertyService.addProspect(this.propertyId, {
          userId: client.id,
        });
      } else {
        const firstName = this.prospectForm.controls.firstName.value.trim();
        const lastName = this.prospectForm.controls.lastName.value.trim();
        const phone = this.prospectForm.controls.phone.value.trim();
        const email = this.prospectForm.controls.email.value.trim().toLowerCase();

        if (!firstName || !lastName || !phone || !email) {
          this.prospectFeedback.set("Renseignez les champs obligatoires du nouveau client.");
          return;
        }

        created = await this.propertyService.addProspect(this.propertyId, {
          newClient: {
            firstName,
            lastName,
            phone,
            email,
            address: this.normalizeEmptyAsNull(this.prospectForm.controls.address.value),
            postalCode: this.normalizeEmptyAsNull(this.prospectForm.controls.postalCode.value),
            city: this.normalizeEmptyAsNull(this.prospectForm.controls.city.value),
          },
        });
      }

      this.prospects.update((items) =>
        [created, ...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
      this.prospectFeedback.set("Prospect ajouté.");
      this.closeProspectModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ajout impossible.";
      this.prospectFeedback.set(message);
    } finally {
      this.prospectPending.set(false);
    }
  }

  openVisitModal(): void {
    const startsAt = this.getDefaultVisitStart();
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    this.visitProspectMode.set("existing");
    this.visitForm.reset({
      existingLookup: "",
      userId: "",
      startsAt: this.formatForDateTimeInput(startsAt),
      endsAt: this.formatForDateTimeInput(endsAt),
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      address: "",
      postalCode: "",
      city: "",
    });
    this.visitFeedback.set(null);
    this.visitSuggestionsOpen.set(false);
    this.visitModalOpen.set(true);

    if (this.clients().length === 0) {
      void this.loadClientOptions();
    }
  }

  closeVisitModal(): void {
    this.visitModalOpen.set(false);
    this.visitSuggestionsOpen.set(false);
  }

  onVisitBackdropClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    this.closeVisitModal();
  }

  setVisitProspectMode(mode: VisitProspectMode): void {
    this.visitProspectMode.set(mode);
    this.visitFeedback.set(null);
    this.visitForm.controls.userId.setValue("");
    this.visitSuggestionsOpen.set(false);
  }

  onVisitStartInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const startsAtRaw = target.value.trim();
    if (!startsAtRaw) {
      return;
    }

    const startDate = new Date(startsAtRaw);
    if (Number.isNaN(startDate.getTime())) {
      return;
    }

    const endsAt = new Date(startDate.getTime() + 60 * 60 * 1000);
    this.visitForm.controls.endsAt.setValue(this.formatForDateTimeInput(endsAt));
  }

  onVisitLookupInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    this.applyVisitLookupValue(target.value);
    this.visitSuggestionsOpen.set(true);
  }

  onVisitLookupFocus(): void {
    this.visitSuggestionsOpen.set(true);
  }

  onVisitLookupContainerFocusOut(event: FocusEvent, container: HTMLElement): void {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && container.contains(relatedTarget)) {
      return;
    }

    this.visitSuggestionsOpen.set(false);
  }

  onVisitSuggestionMouseDown(event: MouseEvent): void {
    event.preventDefault();
  }

  toggleVisitSuggestions(): void {
    this.visitSuggestionsOpen.update((isOpen) => !isOpen);
  }

  selectVisitClient(client: AccountUserResponse): void {
    this.visitForm.controls.existingLookup.setValue(this.prospectOptionLabel(client));
    this.visitForm.controls.userId.setValue(client.id);
    this.visitSuggestionsOpen.set(false);
  }

  async addVisit(): Promise<void> {
    if (this.visitPending()) {
      return;
    }

    const startsAtRaw = this.visitForm.controls.startsAt.value.trim();
    const endsAtRaw = this.visitForm.controls.endsAt.value.trim();

    if (!startsAtRaw || !endsAtRaw) {
      this.visitFeedback.set("Renseignez les horaires de début et de fin.");
      return;
    }

    const startsAtIso = this.toIsoFromDateTimeInput(startsAtRaw);
    const endsAtIso = this.toIsoFromDateTimeInput(endsAtRaw);

    if (!startsAtIso || !endsAtIso) {
      this.visitFeedback.set("Les horaires fournis sont invalides.");
      return;
    }

    if (new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
      this.visitFeedback.set("L'heure de fin doit être après l'heure de début.");
      return;
    }

    this.visitPending.set(true);
    this.visitFeedback.set("Création de la visite en cours...");

    try {
      let prospectUserId = "";
      const mode = this.visitProspectMode();

      if (mode === "existing") {
        const client = this.resolveSelectedVisitClient();

        if (!client) {
          this.visitFeedback.set(
            "Sélectionnez un client existant dans la liste d'autocomplétion.",
          );
          return;
        }

        prospectUserId = client.id;
      } else {
        const firstName = this.visitForm.controls.firstName.value.trim();
        const lastName = this.visitForm.controls.lastName.value.trim();
        const phone = this.visitForm.controls.phone.value.trim();
        const email = this.visitForm.controls.email.value.trim().toLowerCase();

        if (!firstName || !lastName || !phone || !email) {
          this.visitFeedback.set("Renseignez les champs obligatoires du nouveau prospect.");
          return;
        }

        const createdProspect = await this.propertyService.addProspect(this.propertyId, {
          newClient: {
            firstName,
            lastName,
            phone,
            email,
            address: this.normalizeEmptyAsNull(this.visitForm.controls.address.value),
            postalCode: this.normalizeEmptyAsNull(this.visitForm.controls.postalCode.value),
            city: this.normalizeEmptyAsNull(this.visitForm.controls.city.value),
          },
        });

        prospectUserId = createdProspect.userId;
        this.prospects.update((items) =>
          [createdProspect, ...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      }

      const createdVisit = await this.propertyService.addVisit(this.propertyId, {
        prospectUserId,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
      });

      this.visits.update((items) =>
        [createdVisit, ...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      );
      this.requestFeedback.set("Visite ajoutée.");
      this.closeVisitModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Création de visite impossible.";
      this.visitFeedback.set(message);
    } finally {
      this.visitPending.set(false);
    }
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} o`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} Ko`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  prospectDisplayName(prospect: PropertyProspectResponse): string {
    return `${prospect.firstName} ${prospect.lastName}`.trim();
  }

  prospectRelationLabel(relationRole: string): string {
    switch (relationRole) {
      case "PROSPECT":
      case "ACHETEUR":
        return "Prospect";
      case "OWNER":
        return "Propriétaire";
      case "NOTAIRE":
        return "Notaire";
      default:
        return relationRole;
    }
  }

  private async loadClientOptions(): Promise<void> {
    this.clientsLoading.set(true);

    try {
      const response = await this.userService.list(100, undefined, "CLIENT");
      this.clients.set(response.items);
    } finally {
      this.clientsLoading.set(false);
    }
  }

  private async loadPropertyRisks(): Promise<void> {
    this.risksLoading.set(true);
    this.risksError.set(null);

    try {
      const response = await this.propertyService.getRisks(this.propertyId);
      this.risks.set(response);
      if (
        this.activeMainTab() === "valuation" &&
        !this.inseeIndicators() &&
        !this.inseeLoading()
      ) {
        void this.loadInseeIndicators();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Chargement des risques impossible.";
      this.risksError.set(message);
    } finally {
      this.risksLoading.set(false);
    }
  }

  async loadPropertyComparables(options?: LoadComparablesOptions): Promise<void> {
    if (this.comparablesLoading()) {
      return;
    }

    this.comparablesLoading.set(true);
    this.comparablesError.set(null);

    try {
      const property = this.property();
      const propertyType = property ? this.resolveComparableTypeFromProperty(property) : undefined;
      const response = await this.propertyService.getComparables(this.propertyId, {
        propertyType,
        forceRefresh: options?.forceRefresh,
      });
      this.comparables.set(response);
      this.initializeComparablesFilters(response);
      this.renderComparablesChart();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Chargement des comparables impossible.";
      this.comparablesError.set(message);
    } finally {
      this.comparablesLoading.set(false);
    }
  }

  async loadInseeIndicators(): Promise<void> {
    if (this.inseeLoading()) {
      return;
    }

    const property = this.property();
    if (!property) {
      return;
    }

    this.inseeLoading.set(true);
    this.inseeError.set(null);

    try {
      const response = await this.inseeCityService.getCityIndicators({
        inseeCode: this.risks()?.location.inseeCode,
        city: property.city,
        postalCode: property.postalCode,
      });
      this.inseeIndicators.set(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Chargement des données INSEE impossible.";
      this.inseeError.set(message);
    } finally {
      this.inseeLoading.set(false);
    }
  }

  onRentalMonthlyRentChange(rawValue: string): void {
    const parsed = this.parseOptionalNumber(rawValue);
    if (parsed === null || parsed < 0) {
      this.rentalMonthlyRent.set(null);
      this.enqueueRentalInputsPersist();
      return;
    }

    this.rentalMonthlyRent.set(this.roundComparable(parsed));
    this.enqueueRentalInputsPersist();
  }

  onRentalHoldingYearsChange(rawValue: string): void {
    const parsed = this.parseOptionalNumber(rawValue);
    if (parsed === null || parsed < 1) {
      this.rentalHoldingYears.set(null);
      this.enqueueRentalInputsPersist();
      return;
    }

    this.rentalHoldingYears.set(Math.max(1, Math.floor(parsed)));
    this.enqueueRentalInputsPersist();
  }

  onRentalResalePriceChange(rawValue: string): void {
    const parsed = this.parseOptionalNumber(rawValue);
    if (parsed === null || parsed <= 0) {
      this.rentalResalePrice.set(null);
      this.enqueueRentalInputsPersist();
      return;
    }

    this.rentalResalePrice.set(this.roundComparable(parsed));
    this.enqueueRentalInputsPersist();
  }

  onComparableRadiusFilterChange(rawValue: string): void {
    const domain = this.comparablesRadiusDomain();
    if (!domain) {
      this.comparableRadiusFilterM.set(null);
      this.renderComparablesChart();
      return;
    }

    const parsed = this.parseComparableFilterValue(rawValue);
    if (parsed === null) {
      this.comparableRadiusFilterM.set(domain.max);
      this.renderComparablesChart();
      return;
    }

    const next = Math.min(Math.max(parsed, domain.min), domain.max);
    this.comparableRadiusFilterM.set(this.roundComparable(next));
    this.renderComparablesChart();
  }

  onComparableSurfaceMinChange(rawValue: string): void {
    const domain = this.comparablesSurfaceDomain();
    if (!domain) {
      this.comparableSurfaceMinM2.set(null);
      this.enqueueComparableFiltersPersist();
      this.renderComparablesChart();
      return;
    }

    const parsed = this.parseComparableFilterValue(rawValue);
    const currentMax = this.comparableSurfaceMaxM2() ?? domain.max;
    if (parsed === null) {
      this.comparableSurfaceMinM2.set(domain.min);
      this.comparableSurfaceMaxM2.set(Math.max(currentMax, domain.min));
      this.syncLatestSimilarSurfaceFromComparableFilters();
      this.enqueueComparableFiltersPersist();
      this.renderComparablesChart();
      return;
    }

    const nextMin = this.roundComparable(Math.min(Math.max(parsed, domain.min), currentMax));
    this.comparableSurfaceMinM2.set(nextMin);
    this.comparableSurfaceMaxM2.set(Math.max(currentMax, nextMin));
    this.syncLatestSimilarSurfaceFromComparableFilters();
    this.enqueueComparableFiltersPersist();
    this.renderComparablesChart();
  }

  onComparableSurfaceMaxChange(rawValue: string): void {
    const domain = this.comparablesSurfaceDomain();
    if (!domain) {
      this.comparableSurfaceMaxM2.set(null);
      this.enqueueComparableFiltersPersist();
      this.renderComparablesChart();
      return;
    }

    const parsed = this.parseComparableFilterValue(rawValue);
    const currentMin = this.comparableSurfaceMinM2() ?? domain.min;
    if (parsed === null) {
      this.comparableSurfaceMaxM2.set(domain.max);
      this.comparableSurfaceMinM2.set(Math.min(currentMin, domain.max));
      this.syncLatestSimilarSurfaceFromComparableFilters();
      this.enqueueComparableFiltersPersist();
      this.renderComparablesChart();
      return;
    }

    const nextMax = this.roundComparable(Math.max(Math.min(parsed, domain.max), currentMin));
    this.comparableSurfaceMaxM2.set(nextMax);
    this.comparableSurfaceMinM2.set(Math.min(currentMin, nextMax));
    this.syncLatestSimilarSurfaceFromComparableFilters();
    this.enqueueComparableFiltersPersist();
    this.renderComparablesChart();
  }

  onComparableTerrainMinChange(rawValue: string): void {
    const domain = this.comparablesTerrainDomain();
    if (!domain) {
      this.comparableTerrainMinM2.set(null);
      this.enqueueComparableFiltersPersist();
      this.renderComparablesChart();
      return;
    }

    const parsed = this.parseComparableFilterValue(rawValue);
    const currentMax = this.comparableTerrainMaxM2() ?? domain.max;
    if (parsed === null) {
      this.comparableTerrainMinM2.set(domain.min);
      this.comparableTerrainMaxM2.set(Math.max(currentMax, domain.min));
      this.syncLatestSimilarTerrainFromComparableFilters();
      this.enqueueComparableFiltersPersist();
      this.renderComparablesChart();
      return;
    }

    const nextMin = this.roundComparable(Math.min(Math.max(parsed, domain.min), currentMax));
    this.comparableTerrainMinM2.set(nextMin);
    this.comparableTerrainMaxM2.set(Math.max(currentMax, nextMin));
    this.syncLatestSimilarTerrainFromComparableFilters();
    this.enqueueComparableFiltersPersist();
    this.renderComparablesChart();
  }

  onComparableTerrainMaxChange(rawValue: string): void {
    const domain = this.comparablesTerrainDomain();
    if (!domain) {
      this.comparableTerrainMaxM2.set(null);
      this.enqueueComparableFiltersPersist();
      this.renderComparablesChart();
      return;
    }

    const parsed = this.parseComparableFilterValue(rawValue);
    const currentMin = this.comparableTerrainMinM2() ?? domain.min;
    if (parsed === null) {
      this.comparableTerrainMaxM2.set(domain.max);
      this.comparableTerrainMinM2.set(Math.min(currentMin, domain.max));
      this.syncLatestSimilarTerrainFromComparableFilters();
      this.enqueueComparableFiltersPersist();
      this.renderComparablesChart();
      return;
    }

    const nextMax = this.roundComparable(Math.max(Math.min(parsed, domain.max), currentMin));
    this.comparableTerrainMaxM2.set(nextMax);
    this.comparableTerrainMinM2.set(Math.min(currentMin, nextMax));
    this.syncLatestSimilarTerrainFromComparableFilters();
    this.enqueueComparableFiltersPersist();
    this.renderComparablesChart();
  }

  onLatestSimilarRadiusFilterChange(rawValue: string): void {
    const domain = this.comparablesRadiusDomain();
    if (!domain) {
      this.latestSimilarRadiusFilterM.set(null);
      return;
    }

    const parsed = this.parseComparableFilterValue(rawValue);
    if (parsed === null) {
      this.latestSimilarRadiusFilterM.set(domain.max);
      return;
    }

    const next = Math.min(Math.max(parsed, domain.min), domain.max);
    this.latestSimilarRadiusFilterM.set(this.roundComparable(next));
  }

  onLatestSimilarSurfaceMinChange(rawValue: string): void {
    const slider = this.latestSimilarSurfaceSlider();
    if (!slider) {
      this.latestSimilarSurfaceMinM2.set(null);
      return;
    }

    const parsed = this.parseComparableFilterValue(rawValue);
    const currentMax = this.latestSimilarSurfaceMaxM2() ?? slider.currentMax;
    if (parsed === null) {
      this.latestSimilarSurfaceMinM2.set(slider.min);
      this.latestSimilarSurfaceMaxM2.set(Math.max(currentMax, slider.min));
      return;
    }

    const nextMin = this.roundComparable(Math.min(Math.max(parsed, slider.min), currentMax));
    this.latestSimilarSurfaceMinM2.set(nextMin);
    this.latestSimilarSurfaceMaxM2.set(Math.max(currentMax, nextMin));
  }

  onLatestSimilarSurfaceMaxChange(rawValue: string): void {
    const slider = this.latestSimilarSurfaceSlider();
    if (!slider) {
      this.latestSimilarSurfaceMaxM2.set(null);
      return;
    }

    const parsed = this.parseComparableFilterValue(rawValue);
    const currentMin = this.latestSimilarSurfaceMinM2() ?? slider.currentMin;
    if (parsed === null) {
      this.latestSimilarSurfaceMaxM2.set(slider.max);
      this.latestSimilarSurfaceMinM2.set(Math.min(currentMin, slider.max));
      return;
    }

    const nextMax = this.roundComparable(Math.max(Math.min(parsed, slider.max), currentMin));
    this.latestSimilarSurfaceMaxM2.set(nextMax);
    this.latestSimilarSurfaceMinM2.set(Math.min(currentMin, nextMax));
  }

  onLatestSimilarTerrainMinChange(rawValue: string): void {
    const slider = this.latestSimilarTerrainSlider();
    if (!slider) {
      this.latestSimilarTerrainMinM2.set(null);
      return;
    }

    const parsed = this.parseComparableFilterValue(rawValue);
    const currentMax = this.latestSimilarTerrainMaxM2() ?? slider.currentMax;
    if (parsed === null) {
      this.latestSimilarTerrainMinM2.set(slider.min);
      this.latestSimilarTerrainMaxM2.set(Math.max(currentMax, slider.min));
      return;
    }

    const nextMin = this.roundComparable(Math.min(Math.max(parsed, slider.min), currentMax));
    this.latestSimilarTerrainMinM2.set(nextMin);
    this.latestSimilarTerrainMaxM2.set(Math.max(currentMax, nextMin));
  }

  onLatestSimilarTerrainMaxChange(rawValue: string): void {
    const slider = this.latestSimilarTerrainSlider();
    if (!slider) {
      this.latestSimilarTerrainMaxM2.set(null);
      return;
    }

    const parsed = this.parseComparableFilterValue(rawValue);
    const currentMin = this.latestSimilarTerrainMinM2() ?? slider.currentMin;
    if (parsed === null) {
      this.latestSimilarTerrainMaxM2.set(slider.max);
      this.latestSimilarTerrainMinM2.set(Math.min(currentMin, slider.max));
      return;
    }

    const nextMax = this.roundComparable(Math.max(Math.min(parsed, slider.max), currentMin));
    this.latestSimilarTerrainMaxM2.set(nextMax);
    this.latestSimilarTerrainMinM2.set(Math.min(currentMin, nextMax));
  }

  onValuationSalePriceInput(rawValue: string): void {
    this.valuationSalePriceInput.set(rawValue);
  }

  onValuationAgentJustificationInput(rawValue: string): void {
    this.valuationAgentJustificationInput.set(rawValue);
  }

  async saveValuationSalePrice(): Promise<void> {
    if (this.valuationSalePriceSaving()) {
      return;
    }

    const parsedPrice = this.parseOptionalNumber(this.valuationSalePriceInput());
    if (parsedPrice === null || parsedPrice <= 0) {
      this.valuationSalePriceFeedback.set("Renseignez un prix de vente valide.");
      return;
    }

    this.valuationSalePriceSaving.set(true);
    this.valuationSalePriceFeedback.set("Mise à jour du prix de vente...");

    try {
      const nextPrice = Math.round(parsedPrice);
      const updated = await this.propertyService.patch(this.propertyId, { price: nextPrice });
      this.property.set(updated);
      this.valuationSalePriceInput.set(String(nextPrice));
      this.valuationSalePriceFeedback.set("Prix de vente mis à jour.");
      this.comparables.update((current) =>
        current
          ? {
              ...current,
              subject: {
                ...current.subject,
                askingPrice: nextPrice,
              },
            }
          : current,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mise à jour du prix impossible.";
      this.valuationSalePriceFeedback.set(message);
    } finally {
      this.valuationSalePriceSaving.set(false);
    }
  }

  async saveValuationAgentOpinion(): Promise<void> {
    if (this.valuationAgentOpinionSaving()) {
      return;
    }

    const property = this.property();
    if (!property) {
      return;
    }

    const parsedPrice = this.parseOptionalNumber(this.valuationSalePriceInput());
    if (parsedPrice === null || parsedPrice <= 0) {
      this.valuationAgentOpinionFeedback.set("Renseignez un prix de vente proposé valide.");
      return;
    }

    const nextPrice = Math.round(parsedPrice);
    const justification = this.valuationAgentJustificationInput().trim();
    const detailsRecord = this.isRecord(property.details) ? property.details : {};
    const currentAgentDetails = this.isRecord(detailsRecord["valuationAgent"])
      ? (detailsRecord["valuationAgent"] as Record<string, unknown>)
      : {};

    this.valuationAgentOpinionSaving.set(true);
    this.valuationAgentOpinionFeedback.set("Enregistrement de l'avis agent...");

    try {
      const updated = await this.propertyService.patch(this.propertyId, {
        price: nextPrice,
        details: {
          valuationAgent: {
            ...currentAgentDetails,
            proposedSalePrice: nextPrice,
            justification: justification || null,
            updatedAt: new Date().toISOString(),
          },
        },
      });

      this.property.set(updated);
      this.valuationSalePriceInput.set(String(nextPrice));
      this.valuationAgentJustificationInput.set(this.resolveValuationAgentJustificationInput(updated));
      this.valuationSalePriceFeedback.set("Prix de vente mis à jour.");
      this.valuationAgentOpinionFeedback.set("Avis agent enregistré.");
      this.comparables.update((current) =>
        current
          ? {
              ...current,
              subject: {
                ...current.subject,
                askingPrice: nextPrice,
              },
            }
          : current,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Enregistrement de l'avis agent impossible.";
      this.valuationAgentOpinionFeedback.set(message);
    } finally {
      this.valuationAgentOpinionSaving.set(false);
    }
  }

  async rerunValuationAnalysis(): Promise<void> {
    const property = this.property();
    if (!property || this.valuationAiPending()) {
      return;
    }

    this.valuationAiPending.set(true);
    this.valuationAiFeedback.set("Analyse IA en cours...");

    try {
      const response = await this.propertyService.runValuationAnalysis(
        this.propertyId,
        this.buildCurrentValuationAIRequest(property),
      );

      this.valuationAiResult.set(response);
      this.valuationAiPromptVisible.set(false);
      this.valuationAiPromptText.set(null);
      this.valuationAiFeedback.set("Analyse IA mise à jour.");

      this.property.update((current) => {
        if (!current) {
          return current;
        }

        const details = this.isRecord(current.details) ? current.details : {};
        const { promptUsed: _promptUsed, ...persistedSnapshot } = response;
        return {
          ...current,
          details: {
            ...details,
            [VALUATION_AI_DETAILS_KEY]: persistedSnapshot,
          },
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analyse IA impossible.";
      this.valuationAiFeedback.set(message);
    } finally {
      this.valuationAiPending.set(false);
    }
  }

  async toggleValuationPromptVisibility(): Promise<void> {
    if (this.valuationAiPromptVisible()) {
      this.valuationAiPromptVisible.set(false);
      return;
    }

    const property = this.property();
    if (!property || this.valuationAiPromptPending()) {
      return;
    }

    this.valuationAiPromptPending.set(true);
    this.valuationAiFeedback.set("Génération du prompt...");

    try {
      const response = await this.propertyService.generateValuationPrompt(
        this.propertyId,
        this.buildCurrentValuationAIRequest(property),
      );
      this.valuationAiPromptText.set(response.promptUsed.trim());
      this.valuationAiPromptVisible.set(true);
      this.valuationAiFeedback.set("Prompt généré.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Génération du prompt impossible.";
      this.valuationAiFeedback.set(message);
    } finally {
      this.valuationAiPromptPending.set(false);
    }
  }

  sortComparableSalesBy(key: ComparableSalesSortKey): void {
    this.comparableSalesSort.update((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        key,
        direction: key === "saleDate" ? "desc" : "asc",
      };
    });
    this.salesPage.set(1);
  }

  comparableSalesSortDirection(key: ComparableSalesSortKey): ComparableSalesSortDirection | null {
    const sort = this.comparableSalesSort();
    return sort.key === key ? sort.direction : null;
  }

  comparableSalesSortIndicator(key: ComparableSalesSortKey): string {
    const direction = this.comparableSalesSortDirection(key);
    if (direction === "asc") {
      return "↑";
    }
    if (direction === "desc") {
      return "↓";
    }

    return "↕";
  }

  comparableSalesAriaSort(key: ComparableSalesSortKey): "ascending" | "descending" | "none" {
    const direction = this.comparableSalesSortDirection(key);
    if (direction === "asc") {
      return "ascending";
    }
    if (direction === "desc") {
      return "descending";
    }

    return "none";
  }

  goToSalesPage(page: number): void {
    const pagination = this.salesPagination();
    const nextPage = Math.min(Math.max(Math.floor(page), 1), pagination.totalPages);
    this.salesPage.set(nextPage);
  }

  goToPreviousSalesPage(): void {
    this.goToSalesPage(this.salesPagination().page - 1);
  }

  goToNextSalesPage(): void {
    this.goToSalesPage(this.salesPagination().page + 1);
  }

  sliderPercent(value: number | null, min: number, max: number): number | null {
    if (value === null || !Number.isFinite(value)) {
      return null;
    }

    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return 0;
    }

    const clamped = Math.min(Math.max(value, min), max);
    return this.roundComparable(((clamped - min) / (max - min)) * 100);
  }

  comparablePricingLabel(value: PropertyComparablesResponse["subject"]["pricingPosition"]): string {
    return resolveComparablePricingLabel(value);
  }

  variationClass(value: number | null): string {
    if (value === null) {
      return "text-slate-500";
    }

    if (value > 0) {
      return "text-emerald-700";
    }

    if (value < 0) {
      return "text-red-700";
    }

    return "text-slate-700";
  }

  private buildCurrentValuationAIRequest(property: PropertyResponse): PropertyValuationAIRequest {
    const adjustedPrice = this.parseOptionalNumber(this.valuationSalePriceInput());

    return {
      comparableFilters: {
        propertyType: this.comparables()?.propertyType ?? this.resolveComparableTypeFromProperty(property),
        radiusMaxM: this.comparableRadiusFilterM(),
        surfaceMinM2: this.comparableSurfaceMinM2(),
        surfaceMaxM2: this.comparableSurfaceMaxM2(),
        landSurfaceMinM2: this.comparableTerrainMinM2(),
        landSurfaceMaxM2: this.comparableTerrainMaxM2(),
      },
      agentAdjustedPrice: adjustedPrice !== null && adjustedPrice > 0 ? Math.round(adjustedPrice) : null,
    };
  }

  private renderComparablesChart(): void {
    const response = this.comparables();
    const chartDomains = this.comparablesChartDomains();
    const filteredPoints = this.chartComparablePoints();
    if (!response || !chartDomains || filteredPoints.length === 0 || !this.comparablesChartCanvas) {
      this.destroyComparablesChart();
      return;
    }

    let context: CanvasRenderingContext2D | null = null;
    try {
      context = this.comparablesChartCanvas.getContext("2d");
    } catch {
      context = null;
    }

    if (!context) {
      this.destroyComparablesChart();
      return;
    }

    const comparablePoints: ComparableScatterPoint[] = filteredPoints.map((point) => ({
        x: point.surfaceM2,
        y: point.salePrice,
        saleDate: point.saleDate,
        landSurfaceM2: point.landSurfaceM2,
        city: point.city,
        postalCode: point.postalCode,
        distanceM: point.distanceM,
      }));

    const subjectPoint = this.resolveSubjectPointForChart(response);
    const regression = this.chartComparableRegression();
    const minX = chartDomains.xDomain.min;
    const maxX = chartDomains.xDomain.max;
    const datasets: ChartDataset<"scatter", ComparableScatterPoint[]>[] = [
      {
        label: "Ventes",
        data: comparablePoints,
        showLine: false,
        pointRadius: 4,
        pointHoverRadius: 5,
        pointBackgroundColor: "#0f172a",
      },
    ];
    if (subjectPoint) {
      datasets.push({
        label: "Bien en cours",
        data: [subjectPoint],
        showLine: false,
        pointRadius: 8,
        pointHoverRadius: 10,
        pointHitRadius: 14,
        pointBackgroundColor: "#f97316",
        pointBorderColor: "#7c2d12",
        pointBorderWidth: 2,
      });
    }

    if (
      regression.slope !== null &&
      Number.isFinite(regression.slope) &&
      regression.intercept !== null &&
      Number.isFinite(regression.intercept)
    ) {
      const yAtMin = regression.slope * minX + regression.intercept;
      const yAtMax = regression.slope * maxX + regression.intercept;

      if (Number.isFinite(yAtMin) && Number.isFinite(yAtMax)) {
        datasets.push({
          label: "Droite affine",
          data: [
            { x: minX, y: yAtMin },
            { x: maxX, y: yAtMax },
          ],
          showLine: true,
          borderColor: "#0ea5e9",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
        });
      }
    }

    this.destroyComparablesChart();
    this.comparablesChart = new Chart<"scatter", ComparableScatterPoint[]>(context, {
      type: "scatter",
      data: {
        datasets,
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        scales: {
          x: {
            type: "linear",
            min: chartDomains.xDomain.min,
            max: chartDomains.xDomain.max,
            title: {
              display: true,
              text: "Surface (m²)",
            },
          },
          y: {
            type: "linear",
            min: chartDomains.yDomain.min,
            max: chartDomains.yDomain.max,
            title: {
              display: true,
              text: "Prix (€)",
            },
          },
        },
        plugins: {
          legend: {
            display: true,
          },
          tooltip: {
            filter: (context) => context.dataset.label !== "Droite affine",
            callbacks: {
              title: () => "",
              label: (context) => {
                const raw = context.raw as ComparableScatterPoint | undefined;
                const surface = typeof raw?.x === "number" ? raw.x : null;
                const price = typeof raw?.y === "number" ? raw.y : null;
                const lines: string[] = [];

                if (surface === null || price === null) {
                  return lines;
                }

                if (context.dataset.label === "Bien en cours") {
                  lines.push("Bien en cours");
                }

                const formattedSurface = new Intl.NumberFormat("fr-FR", {
                  maximumFractionDigits: 0,
                }).format(surface);
                const formattedPrice = new Intl.NumberFormat("fr-FR", {
                  maximumFractionDigits: 0,
                }).format(price);
                lines.push(`Surface: ${formattedSurface} m²`);
                lines.push(`Prix: ${formattedPrice} €`);

                const saleDate = this.formatComparableSaleDate(raw?.saleDate);
                if (saleDate) {
                  lines.push(`Date de vente: ${saleDate}`);
                }

                if (
                  response.propertyType === "MAISON" &&
                  typeof raw?.landSurfaceM2 === "number" &&
                  Number.isFinite(raw.landSurfaceM2)
                ) {
                  lines.push(
                    `Surface terrain: ${new Intl.NumberFormat("fr-FR", {
                      maximumFractionDigits: 0,
                    }).format(raw.landSurfaceM2)} m²`,
                  );
                }

                if (typeof raw?.distanceM === "number" && Number.isFinite(raw.distanceM)) {
                  lines.push(
                    `Distance: ${new Intl.NumberFormat("fr-FR", {
                      maximumFractionDigits: 0,
                    }).format(raw.distanceM)} m`,
                  );
                }

                const cityLabel = [raw?.postalCode, raw?.city].filter(Boolean).join(" ");
                if (cityLabel) {
                  lines.push(`Commune: ${cityLabel}`);
                }

                return lines;
              },
            },
          },
        },
      },
    });
  }

  private resolveSubjectPointForChart(
    response: PropertyComparablesResponse,
  ): ComparableScatterPoint | null {
    const subjectSurface =
      this.parsePositiveNumber(response.subject.surfaceM2) ??
      this.resolveComparableTargetSurfaceM2(response);
    if (subjectSurface === null) {
      return null;
    }

    let subjectPrice = this.parsePositiveNumber(response.subject.askingPrice);
    if (subjectPrice === null) {
      const property = this.property();
      if (property) {
        subjectPrice = this.parsePositiveNumber(property.price);
        if (subjectPrice === null) {
          const financeDetails = this.getCategoryDetails(property, "finance");
          subjectPrice =
            this.parsePositiveNumber(financeDetails["salePriceTtc"]) ??
            this.parsePositiveNumber(financeDetails["netSellerPrice"]);
        }
      }
    }

    if (subjectPrice === null) {
      return null;
    }

    return {
      x: this.roundComparable(subjectSurface),
      y: this.roundComparable(subjectPrice),
    };
  }

  private destroyComparablesChart(): void {
    if (!this.comparablesChart) {
      return;
    }

    this.comparablesChart.destroy();
    this.comparablesChart = null;
  }

  private roundComparable(value: number): number {
    return Number(value.toFixed(2));
  }

  private parseComparableFilterValue(rawValue: string): number | null {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed;
  }

  private computeMedian(values: number[]): number | null {
    if (values.length === 0) {
      return null;
    }

    const sorted = values
      .filter((value) => Number.isFinite(value))
      .slice()
      .sort((a, b) => a - b);
    if (sorted.length === 0) {
      return null;
    }

    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return this.roundComparable((sorted[middle - 1] + sorted[middle]) / 2);
    }

    return this.roundComparable(sorted[middle]);
  }

  private resolveComparablePricePerM2(
    point: PropertyComparablesResponse["points"][number],
  ): number | null {
    if (Number.isFinite(point.pricePerM2) && point.pricePerM2 > 0) {
      return point.pricePerM2;
    }

    if (
      Number.isFinite(point.salePrice) &&
      point.salePrice > 0 &&
      Number.isFinite(point.surfaceM2) &&
      point.surfaceM2 > 0
    ) {
      return point.salePrice / point.surfaceM2;
    }

    return null;
  }

  private resolveComparableSalesSortValue(
    point: PropertyComparablesResponse["points"][number],
    key: ComparableSalesSortKey,
  ): number | null {
    if (key === "saleDate") {
      return this.parseComparableSaleTimestamp(point.saleDate);
    }

    if (key === "surfaceM2") {
      return Number.isFinite(point.surfaceM2) && point.surfaceM2 > 0 ? point.surfaceM2 : null;
    }

    if (key === "landSurfaceM2") {
      return typeof point.landSurfaceM2 === "number" && Number.isFinite(point.landSurfaceM2) && point.landSurfaceM2 > 0
        ? point.landSurfaceM2
        : null;
    }

    if (key === "salePrice") {
      return Number.isFinite(point.salePrice) && point.salePrice > 0 ? point.salePrice : null;
    }

    return this.resolveComparablePricePerM2(point);
  }

  private computePredictedComparablePrice(input: {
    surfaceM2: number | null;
    slope: number | null;
    intercept: number | null;
  }): number | null {
    if (
      input.surfaceM2 === null ||
      input.slope === null ||
      input.intercept === null ||
      !Number.isFinite(input.surfaceM2) ||
      !Number.isFinite(input.slope) ||
      !Number.isFinite(input.intercept) ||
      input.surfaceM2 <= 0
    ) {
      return null;
    }

    const predictedPrice = input.slope * input.surfaceM2 + input.intercept;
    if (!Number.isFinite(predictedPrice) || predictedPrice <= 0) {
      return null;
    }

    return this.roundComparable(predictedPrice);
  }

  private initializeRentalProfitabilityInputs(property: PropertyResponse): void {
    const financeDetails = this.getCategoryDetails(property, "finance");
    const defaultMonthlyRent =
      this.parsePositiveNumber(financeDetails["monthlyRent"]) ??
      this.parsePositiveNumber(financeDetails["estimatedRentalValue"]);
    const holdingYearsValue = this.parsePositiveNumber(financeDetails["rentalHoldingYears"]);
    const defaultHoldingYears =
      holdingYearsValue !== null ? Math.max(1, Math.floor(holdingYearsValue)) : 10;
    const defaultResalePrice =
      this.parsePositiveNumber(financeDetails["rentalResalePrice"]) ??
      this.resolveRentalPurchasePriceFromProperty(property);

    this.rentalMonthlyRent.set(defaultMonthlyRent);
    this.rentalHoldingYears.set(defaultHoldingYears);
    this.rentalResalePrice.set(defaultResalePrice);
  }

  private resolveRentalPurchasePrice(): number | null {
    const property = this.property();
    if (!property) {
      return null;
    }

    return this.resolveRentalPurchasePriceFromProperty(property);
  }

  private resolveRentalPurchasePriceFromProperty(property: PropertyResponse): number | null {
    const directPrice = this.parsePositiveNumber(property.price);
    if (directPrice !== null) {
      return directPrice;
    }

    const financeDetails = this.getCategoryDetails(property, "finance");
    const priceFromFinance =
      this.parsePositiveNumber(financeDetails["salePriceTtc"]) ??
      this.parsePositiveNumber(financeDetails["netSellerPrice"]);
    if (priceFromFinance !== null) {
      return priceFromFinance;
    }

    return this.parsePositiveNumber(this.comparables()?.subject.askingPrice);
  }

  private resolveValuationSalePriceInput(property: PropertyResponse): string {
    const detailsRecord = this.isRecord(property.details) ? property.details : {};
    const valuationAgent = this.isRecord(detailsRecord["valuationAgent"])
      ? (detailsRecord["valuationAgent"] as Record<string, unknown>)
      : null;
    const agentPrice = this.parsePositiveNumber(valuationAgent?.["proposedSalePrice"]);
    if (agentPrice !== null) {
      return String(Math.round(agentPrice));
    }

    const directPrice = this.parsePositiveNumber(property.price);
    if (directPrice !== null) {
      return String(Math.round(directPrice));
    }

    const financeDetails = this.getCategoryDetails(property, "finance");
    const priceFromFinance =
      this.parsePositiveNumber(financeDetails["salePriceTtc"]) ??
      this.parsePositiveNumber(financeDetails["netSellerPrice"]);

    return priceFromFinance !== null ? String(Math.round(priceFromFinance)) : "";
  }

  private resolveValuationAgentJustificationInput(property: PropertyResponse): string {
    if (!this.isRecord(property.details)) {
      return "";
    }

    const valuationAgent = this.isRecord(property.details["valuationAgent"])
      ? (property.details["valuationAgent"] as Record<string, unknown>)
      : null;
    if (!valuationAgent) {
      return "";
    }

    return typeof valuationAgent["justification"] === "string"
      ? valuationAgent["justification"].trim()
      : "";
  }

  private findCategoryFieldDefinition(
    categoryId: PropertyDetailsCategoryId,
    fieldKey: string,
  ): PropertyDetailsFieldDefinition | null {
    const category = this.propertyCategories.find((item) => item.id === categoryId);
    if (!category) {
      return null;
    }

    return category.fields.find((field) => field.key === fieldKey) ?? null;
  }

  private readValuationAiSnapshotFromProperty(
    property: PropertyResponse | null,
  ): PropertyValuationAIResponse | null {
    if (!property || !this.isRecord(property.details)) {
      return null;
    }

    const rawSnapshot = property.details[VALUATION_AI_DETAILS_KEY];
    if (!this.isRecord(rawSnapshot)) {
      return null;
    }

    const valuationRaw = rawSnapshot["aiCalculatedValuation"];
    const aiCalculatedValuation =
      typeof valuationRaw === "number" && Number.isFinite(valuationRaw) && valuationRaw > 0
        ? Math.round(valuationRaw)
        : null;
    const valuationJustification =
      typeof rawSnapshot["valuationJustification"] === "string"
        ? rawSnapshot["valuationJustification"].trim()
        : "";
    const generatedAt = typeof rawSnapshot["generatedAt"] === "string" ? rawSnapshot["generatedAt"] : "";
    const comparableCountUsed =
      typeof rawSnapshot["comparableCountUsed"] === "number" &&
      Number.isFinite(rawSnapshot["comparableCountUsed"])
        ? Math.max(Math.round(rawSnapshot["comparableCountUsed"]), 0)
        : 0;
    const rawCriteria = Array.isArray(rawSnapshot["criteriaUsed"]) ? rawSnapshot["criteriaUsed"] : [];
    const criteriaUsed = rawCriteria
      .filter((criterion): criterion is Record<string, unknown> => this.isRecord(criterion))
      .map((criterion) => {
        const label = typeof criterion["label"] === "string" ? criterion["label"].trim() : "";
        const value = typeof criterion["value"] === "string" ? criterion["value"].trim() : "";
        return label && value ? { label, value } : null;
      })
      .filter((criterion): criterion is { label: string; value: string } => criterion !== null);

    if (!valuationJustification || !generatedAt) {
      return null;
    }

    const generatedAtDate = new Date(generatedAt);
    if (Number.isNaN(generatedAtDate.getTime())) {
      return null;
    }

    return {
      propertyId: typeof rawSnapshot["propertyId"] === "string" ? rawSnapshot["propertyId"] : property.id,
      aiCalculatedValuation,
      valuationJustification,
      promptUsed: "",
      generatedAt,
      comparableCountUsed,
      criteriaUsed,
    };
  }

  private resolveRentalAnnualPropertyTax(): number {
    const property = this.property();
    if (!property) {
      return 0;
    }

    const financeDetails = this.getCategoryDetails(property, "finance");
    return this.parsePositiveNumber(financeDetails["propertyTax"]) ?? 0;
  }

  private resolveRentalAnnualCoproFees(): number {
    const property = this.property();
    if (!property) {
      return 0;
    }

    const financeDetails = this.getCategoryDetails(property, "finance");
    const annualChargesEstimate = this.parsePositiveNumber(financeDetails["annualChargesEstimate"]);
    if (annualChargesEstimate !== null) {
      return annualChargesEstimate;
    }

    const coproDetails = this.getCategoryDetails(property, "copropriete");
    const monthlyCharges =
      this.parsePositiveNumber(coproDetails["monthlyCharges"]) ??
      this.parsePositiveNumber(financeDetails["rentalCharges"]);
    if (monthlyCharges === null) {
      return 0;
    }

    return this.roundComparable(monthlyCharges * 12);
  }

  private resolveComparableTargetSurfaceM2(response: PropertyComparablesResponse): number | null {
    const subjectSurface = this.parsePositiveNumber(response.subject.surfaceM2);
    if (subjectSurface !== null) {
      return subjectSurface;
    }

    return this.readPropertyCharacteristicNumber("livingArea");
  }

  private resolveComparableTargetLandSurfaceM2(): number | null {
    return this.readPropertyCharacteristicNumber("landArea");
  }

  private readPropertyCharacteristicNumber(fieldKey: string): number | null {
    const property = this.property();
    if (!property || !this.isRecord(property.details)) {
      return null;
    }

    const details = property.details;
    const characteristics = this.isRecord(details["characteristics"]) ? details["characteristics"] : null;
    if (!characteristics) {
      return null;
    }

    return this.parsePositiveNumber(characteristics[fieldKey]);
  }

  private parseOptionalNumber(rawValue: string): number | null {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed;
  }

  private parsePositiveNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value.replace(",", "."));
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  }

  private parseComparableSaleTimestamp(value: string | undefined): number | null {
    if (!value) {
      return null;
    }

    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  private resolveComparablesSurfaceDomain(
    response: PropertyComparablesResponse,
  ): { min: number; max: number } | null {
    const surfaces = response.points
      .map((point) => point.surfaceM2)
      .filter((value): value is number => Number.isFinite(value) && value > 0);

    if (surfaces.length === 0) {
      return null;
    }

    const dataMin = Math.min(...surfaces);
    const dataMax = Math.max(...surfaces);
    let domainMin = dataMin;
    let domainMax = dataMax;

    const targetSurface = this.resolveComparableTargetSurfaceM2(response);
    if (targetSurface !== null) {
      const targetMin = targetSurface / 2;
      const targetMax = targetSurface * 2;
      const boundedMin = Math.max(dataMin, targetMin);
      const boundedMax = Math.min(dataMax, targetMax);
      if (boundedMin <= boundedMax) {
        domainMin = boundedMin;
        domainMax = boundedMax;
      }
    }

    return {
      min: this.roundComparable(domainMin),
      max: this.roundComparable(domainMax),
    };
  }

  private formatComparableSaleDate(value: string | undefined): string | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }

  private initializeComparablesFilters(response: PropertyComparablesResponse): void {
    const persistedFilters = this.readPersistedValuationComparableFilters(this.property());
    const radiusDomain = response.points
      .map((point) => point.distanceM)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
    const radiusMax =
      radiusDomain.length > 0
        ? this.roundComparable(Math.max(...radiusDomain))
        : Number.isFinite(response.search.finalRadiusM) && response.search.finalRadiusM > 0
          ? this.roundComparable(response.search.finalRadiusM)
          : null;
    this.comparableRadiusFilterM.set(radiusMax);
    this.latestSimilarRadiusFilterM.set(radiusMax);

    const surfaceDomain = this.resolveComparablesSurfaceDomain(response);
    if (surfaceDomain) {
      const persistedSurfaceMin = persistedFilters?.surfaceMinM2 ?? surfaceDomain.min;
      const persistedSurfaceMax = persistedFilters?.surfaceMaxM2 ?? surfaceDomain.max;
      const surfaceMin = this.roundComparable(
        Math.min(Math.max(persistedSurfaceMin, surfaceDomain.min), surfaceDomain.max),
      );
      const surfaceMax = this.roundComparable(
        Math.max(Math.min(persistedSurfaceMax, surfaceDomain.max), surfaceMin),
      );
      this.comparableSurfaceMinM2.set(surfaceMin);
      this.comparableSurfaceMaxM2.set(surfaceMax);
      this.latestSimilarSurfaceMinM2.set(surfaceMin);
      this.latestSimilarSurfaceMaxM2.set(surfaceMax);
    } else {
      this.comparableSurfaceMinM2.set(null);
      this.comparableSurfaceMaxM2.set(null);
      this.latestSimilarSurfaceMinM2.set(null);
      this.latestSimilarSurfaceMaxM2.set(null);
    }

    if (response.propertyType !== "MAISON") {
      this.comparableTerrainMinM2.set(null);
      this.comparableTerrainMaxM2.set(null);
      this.latestSimilarTerrainMinM2.set(null);
      this.latestSimilarTerrainMaxM2.set(null);
      return;
    }

    const terrainValues = response.points
      .map((point) => point.landSurfaceM2)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

    if (terrainValues.length === 0) {
      this.comparableTerrainMinM2.set(null);
      this.comparableTerrainMaxM2.set(null);
      this.latestSimilarTerrainMinM2.set(null);
      this.latestSimilarTerrainMaxM2.set(null);
      return;
    }

    const terrainDomainMin = this.roundComparable(Math.min(...terrainValues));
    const terrainDomainMax = this.roundComparable(Math.max(...terrainValues));
    const persistedTerrainMin = persistedFilters?.landSurfaceMinM2 ?? terrainDomainMin;
    const persistedTerrainMax = persistedFilters?.landSurfaceMaxM2 ?? terrainDomainMax;
    const terrainMin = this.roundComparable(
      Math.min(Math.max(persistedTerrainMin, terrainDomainMin), terrainDomainMax),
    );
    const terrainMax = this.roundComparable(
      Math.max(Math.min(persistedTerrainMax, terrainDomainMax), terrainMin),
    );
    this.comparableTerrainMinM2.set(terrainMin);
    this.comparableTerrainMaxM2.set(terrainMax);
    this.latestSimilarTerrainMinM2.set(terrainMin);
    this.latestSimilarTerrainMaxM2.set(terrainMax);
  }

  private readPersistedValuationComparableFilters(
    property: PropertyResponse | null,
  ): PersistedValuationComparableFilters | null {
    if (!property || !this.isRecord(property.details)) {
      return null;
    }

    const raw = property.details[VALUATION_COMPARABLE_FILTERS_DETAILS_KEY];
    if (!this.isRecord(raw)) {
      return null;
    }

    const normalize = (value: unknown): number | null => {
      const parsed = this.parsePositiveNumber(value);
      return parsed !== null ? this.roundComparable(parsed) : null;
    };

    const surfaceMinRaw = normalize(raw["surfaceMinM2"]);
    const surfaceMaxRaw = normalize(raw["surfaceMaxM2"]);
    const landMinRaw = normalize(raw["landSurfaceMinM2"]);
    const landMaxRaw = normalize(raw["landSurfaceMaxM2"]);

    return {
      surfaceMinM2:
        surfaceMinRaw !== null && surfaceMaxRaw !== null
          ? Math.min(surfaceMinRaw, surfaceMaxRaw)
          : surfaceMinRaw,
      surfaceMaxM2:
        surfaceMinRaw !== null && surfaceMaxRaw !== null
          ? Math.max(surfaceMinRaw, surfaceMaxRaw)
          : surfaceMaxRaw,
      landSurfaceMinM2:
        landMinRaw !== null && landMaxRaw !== null ? Math.min(landMinRaw, landMaxRaw) : landMinRaw,
      landSurfaceMaxM2:
        landMinRaw !== null && landMaxRaw !== null ? Math.max(landMinRaw, landMaxRaw) : landMaxRaw,
    };
  }

  private syncLatestSimilarSurfaceFromComparableFilters(): void {
    this.latestSimilarSurfaceMinM2.set(this.comparableSurfaceMinM2());
    this.latestSimilarSurfaceMaxM2.set(this.comparableSurfaceMaxM2());
  }

  private syncLatestSimilarTerrainFromComparableFilters(): void {
    this.latestSimilarTerrainMinM2.set(this.comparableTerrainMinM2());
    this.latestSimilarTerrainMaxM2.set(this.comparableTerrainMaxM2());
  }

  private resolveComparableTypeFromProperty(property: PropertyResponse): ComparablePropertyType {
    const details = property.details ?? {};
    const general = this.isRecord(details["general"]) ? details["general"] : {};
    const rawType = typeof general["propertyType"] === "string" ? general["propertyType"] : "";
    const normalized = rawType.trim().toUpperCase();
    const match = COMPARABLE_TYPE_OPTIONS.find((option) => option.value === normalized);
    return match?.value ?? "APPARTEMENT";
  }

  private applyProspectLookupValue(lookup: string): void {
    this.prospectForm.controls.existingLookup.setValue(lookup);
    const match = this.findClientFromLookup(lookup);
    this.prospectForm.controls.userId.setValue(match?.id ?? "");
  }

  private applyVisitLookupValue(lookup: string): void {
    this.visitForm.controls.existingLookup.setValue(lookup);
    const match = this.findClientFromLookup(lookup);
    this.visitForm.controls.userId.setValue(match?.id ?? "");
  }

  private resolveSelectedProspectClient(): AccountUserResponse | null {
    const selectedId = this.prospectForm.controls.userId.value.trim();
    if (selectedId) {
      const selected = this.clients().find((client) => client.id === selectedId) ?? null;
      if (selected) {
        return selected;
      }
    }

    const lookup = this.prospectForm.controls.existingLookup.value.trim();
    return this.findClientFromLookup(lookup);
  }

  private resolveSelectedVisitClient(): AccountUserResponse | null {
    const selectedId = this.visitForm.controls.userId.value.trim();
    if (selectedId) {
      const selected = this.clients().find((client) => client.id === selectedId) ?? null;
      if (selected) {
        return selected;
      }
    }

    const lookup = this.visitForm.controls.existingLookup.value.trim();
    return this.findClientFromLookup(lookup);
  }

  private findClientFromLookup(lookup: string): AccountUserResponse | null {
    const normalizedLookup = lookup.trim().toLowerCase();
    if (!normalizedLookup) {
      return null;
    }

    const clients = this.clients();
    const exact = clients.find((client) => {
      const fullName = `${client.firstName} ${client.lastName}`.trim().toLowerCase();
      const email = (client.email ?? "").toLowerCase();
      return (
        this.prospectOptionLabel(client).toLowerCase() === normalizedLookup ||
        email === normalizedLookup ||
        fullName === normalizedLookup
      );
    });

    if (exact) {
      return exact;
    }

    const partialMatches = clients.filter((client) => {
      const fullName = `${client.firstName} ${client.lastName}`.trim().toLowerCase();
      const email = (client.email ?? "").toLowerCase();
      const phone = (client.phone ?? "").toLowerCase();
      return (
        fullName.includes(normalizedLookup) ||
        email.includes(normalizedLookup) ||
        phone.includes(normalizedLookup)
      );
    });

    return partialMatches.length === 1 ? partialMatches[0] : null;
  }

  private applyProspectModeConstraints(mode: ProspectMode): void {
    if (mode === "existing") {
      this.prospectForm.controls.existingLookup.setValidators([Validators.required]);
      this.prospectForm.controls.firstName.clearValidators();
      this.prospectForm.controls.lastName.clearValidators();
      this.prospectForm.controls.phone.clearValidators();
      this.prospectForm.controls.email.clearValidators();
    } else {
      this.prospectForm.controls.existingLookup.clearValidators();
      this.prospectForm.controls.firstName.setValidators([Validators.required]);
      this.prospectForm.controls.lastName.setValidators([Validators.required]);
      this.prospectForm.controls.phone.setValidators([Validators.required]);
      this.prospectForm.controls.email.setValidators([Validators.required, Validators.email]);
    }

    this.prospectForm.controls.existingLookup.updateValueAndValidity({ emitEvent: false });
    this.prospectForm.controls.firstName.updateValueAndValidity({ emitEvent: false });
    this.prospectForm.controls.lastName.updateValueAndValidity({ emitEvent: false });
    this.prospectForm.controls.phone.updateValueAndValidity({ emitEvent: false });
    this.prospectForm.controls.email.updateValueAndValidity({ emitEvent: false });
  }

  private normalizeEmptyAsNull(value: string): string | null {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private getDefaultVisitStart(): Date {
    const now = new Date();
    const rounded = new Date(now);
    rounded.setSeconds(0, 0);

    const minutes = rounded.getMinutes();
    const roundedMinutes = Math.ceil(minutes / 15) * 15;
    rounded.setMinutes(roundedMinutes);
    return rounded;
  }

  private formatForDateTimeInput(date: Date): string {
    const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
  }

  private toIsoFromDateTimeInput(rawValue: string): string | null {
    const parsed = new Date(rawValue);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString();
  }

  private getPropertyCategoryDefinition(
    categoryId: PropertyDetailsCategoryId,
  ): PropertyDetailsCategoryDefinition {
    return (
      this.propertyCategories.find((category) => category.id === categoryId) ??
      this.propertyCategories[0]
    );
  }

  private getDocumentTabDefinition(tabId: DocumentTabId): DocumentTabDefinition {
    return this.documentTabs.find((tab) => tab.id === tabId) ?? this.documentTabs[0];
  }

  private resolveIsPropertyInCopropriete(property: PropertyResponse): boolean | null {
    const details = property.details;
    if (!this.isRecord(details)) {
      return null;
    }

    const copropriete = this.isRecord(details["copropriete"]) ? details["copropriete"] : null;
    if (!copropriete) {
      return null;
    }

    return this.parseBooleanDetail(copropriete["isCopropriete"]);
  }

  private parseBooleanDetail(value: unknown): boolean | null {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }

    return null;
  }

  private hasHiddenExpectedDocuments(tabId: DocumentTabId): boolean {
    const tab = this.getDocumentTabDefinition(tabId);
    const hiddenExpectedDocumentKeys = new Set(this.hiddenExpectedDocumentKeys());

    for (let index = 0; index < tab.expected.length; index += 1) {
      if (hiddenExpectedDocumentKeys.has(this.buildExpectedDocumentKey(tabId, index))) {
        return true;
      }
    }

    return false;
  }

  private buildExpectedDocumentKey(tabId: DocumentTabId, expectedIndex: number): string {
    const tab = this.getDocumentTabDefinition(tabId);
    const token = this.resolveExpectedDocumentHiddenToken(tab, expectedIndex);
    return `${tab.id}${EXPECTED_DOCUMENT_HIDDEN_KEY_SEPARATOR}${token}`;
  }

  private resolveExpectedDocumentHiddenToken(
    tab: DocumentTabDefinition,
    expectedIndex: number,
  ): string {
    const typeDocument = tab.typeDocuments[expectedIndex];
    if (typeDocument) {
      return typeDocument;
    }

    const expectedLabel = tab.expected[expectedIndex] ?? `expected_${expectedIndex + 1}`;
    return this.toExpectedDocumentToken(expectedLabel);
  }

  private toExpectedDocumentToken(value: string): string {
    const withoutDiacritics = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const normalized = withoutDiacritics
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    return normalized || "EXPECTED";
  }

  private toCanonicalHiddenExpectedDocumentKey(rawKey: string): string | null {
    const trimmedKey = rawKey.trim();
    if (!trimmedKey) {
      return null;
    }

    const separatorIndex = trimmedKey.indexOf(EXPECTED_DOCUMENT_HIDDEN_KEY_SEPARATOR);
    if (separatorIndex <= 0) {
      return trimmedKey;
    }

    const rawTabId = trimmedKey.slice(0, separatorIndex);
    const rawToken = trimmedKey.slice(
      separatorIndex + EXPECTED_DOCUMENT_HIDDEN_KEY_SEPARATOR.length,
    );
    if (!rawToken) {
      return null;
    }

    const tab = this.documentTabs.find((item) => item.id === rawTabId);
    if (!tab) {
      return trimmedKey;
    }

    if (/^\d+$/.test(rawToken)) {
      const legacyIndex = Number(rawToken);
      if (legacyIndex >= 0 && legacyIndex < tab.expected.length) {
        return this.buildExpectedDocumentKey(tab.id, legacyIndex);
      }
    }

    const matchingTypeDocument = tab.typeDocuments.find(
      (typeDocument) => typeDocument.toLowerCase() === rawToken.toLowerCase(),
    );
    if (matchingTypeDocument) {
      return `${tab.id}${EXPECTED_DOCUMENT_HIDDEN_KEY_SEPARATOR}${matchingTypeDocument}`;
    }

    return `${tab.id}${EXPECTED_DOCUMENT_HIDDEN_KEY_SEPARATOR}${rawToken}`;
  }

  private normalizeHiddenExpectedDocumentKeys(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const normalizedKeys = value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => this.toCanonicalHiddenExpectedDocumentKey(entry))
      .filter((entry): entry is string => Boolean(entry));

    return Array.from(new Set(normalizedKeys));
  }

  private enqueueHiddenExpectedDocumentKeysPersist(keys: string[]): void {
    const normalizedKeys = this.normalizeHiddenExpectedDocumentKeys(keys);
    this.hiddenExpectedDocumentKeysPersistQueue = this.hiddenExpectedDocumentKeysPersistQueue.then(
      async () => {
        await this.persistHiddenExpectedDocumentKeys(normalizedKeys);
      },
    );
  }

  private enqueueRentalInputsPersist(): void {
    this.rentalInputsPersistQueue = this.rentalInputsPersistQueue.then(async () => {
      await this.persistRentalInputs();
    });
  }

  private enqueueComparableFiltersPersist(): void {
    if (this.comparableFiltersPersistDebounceTimer !== null) {
      clearTimeout(this.comparableFiltersPersistDebounceTimer);
    }

    this.comparableFiltersPersistDebounceTimer = setTimeout(() => {
      this.comparableFiltersPersistDebounceTimer = null;
      this.comparableFiltersPersistQueue = this.comparableFiltersPersistQueue.then(async () => {
        await this.persistComparableFilters();
      });
    }, 200);
  }

  private async persistRentalInputs(): Promise<void> {
    const property = this.property();
    if (!property || !this.propertyId) {
      return;
    }

    const financeDetails = this.getCategoryDetails(property, "finance");
    const nextFinanceDetails: Record<string, unknown> = {
      ...financeDetails,
      monthlyRent: this.rentalMonthlyRent(),
      rentalHoldingYears: this.rentalHoldingYears(),
      rentalResalePrice: this.rentalResalePrice(),
    };

    try {
      const updated = await this.propertyService.patch(this.propertyId, {
        details: {
          finance: nextFinanceDetails,
        },
      });
      this.property.set(updated);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Mise à jour des données de rentabilité impossible.";
      this.requestFeedback.set(message);
    }
  }

  private async persistComparableFilters(): Promise<void> {
    const property = this.property();
    if (!property || !this.propertyId) {
      return;
    }

    try {
      const updated = await this.propertyService.patch(this.propertyId, {
        details: {
          [VALUATION_COMPARABLE_FILTERS_DETAILS_KEY]: {
            surfaceMinM2: this.comparableSurfaceMinM2(),
            surfaceMaxM2: this.comparableSurfaceMaxM2(),
            landSurfaceMinM2: this.comparableTerrainMinM2(),
            landSurfaceMaxM2: this.comparableTerrainMaxM2(),
          },
        },
      });
      this.property.set(updated);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Mise à jour des filtres de comparables impossible.";
      this.requestFeedback.set(message);
    }
  }

  private async persistHiddenExpectedDocumentKeys(keys: string[]): Promise<void> {
    if (!this.propertyId) {
      return;
    }

    try {
      const updated = await this.propertyService.patch(this.propertyId, {
        hiddenExpectedDocumentKeys: keys,
      });
      this.property.set(updated);
      this.hiddenExpectedDocumentKeys.set(
        this.normalizeHiddenExpectedDocumentKeys(updated.hiddenExpectedDocumentKeys),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mise à jour des documents masqués impossible.";
      this.requestFeedback.set(message);
      this.hiddenExpectedDocumentKeys.set(
        this.normalizeHiddenExpectedDocumentKeys(this.property()?.hiddenExpectedDocumentKeys),
      );
    }
  }

  private createCategoryForms(property: PropertyResponse): CategoryForms {
    const forms = {} as CategoryForms;

    for (const category of this.propertyCategories) {
      forms[category.id] = this.createCategoryForm(property, category);
    }

    return forms;
  }

  private createCategoryForm(
    property: PropertyResponse,
    category: PropertyDetailsCategoryDefinition,
  ): CategoryForm {
    const controls: CategoryControls = {};

    for (const field of category.fields) {
      const rawValue = this.getFieldRawValue(property, category.id, field);
      controls[field.key] = new FormControl(this.toControlValue(rawValue, field), {
        nonNullable: true,
      });
    }

    return new FormGroup(controls);
  }

  private getFieldRawValue(
    property: PropertyResponse,
    categoryId: PropertyDetailsCategoryId,
    field: PropertyDetailsFieldDefinition,
  ): unknown {
    if (field.source === "property") {
      const propertyRecord = property as unknown as Record<string, unknown>;
      return propertyRecord[field.key];
    }

    const categoryDetails = this.getCategoryDetails(property, categoryId);
    return categoryDetails[field.key];
  }

  private getCategoryDetails(
    property: PropertyResponse,
    categoryId: PropertyDetailsCategoryId,
  ): Record<string, unknown> {
    const detailsRecord = property.details as Record<string, unknown>;
    const rawCategory = detailsRecord[categoryId];

    if (typeof rawCategory !== "object" || rawCategory === null || Array.isArray(rawCategory)) {
      return {};
    }

    return rawCategory as Record<string, unknown>;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private toControlValue(rawValue: unknown, field: PropertyDetailsFieldDefinition): string {
    if (rawValue === null || typeof rawValue === "undefined") {
      return "";
    }

    if (field.type === "boolean") {
      if (typeof rawValue === "boolean") {
        return rawValue ? "true" : "false";
      }

      const normalized = String(rawValue).trim().toLowerCase();
      if (normalized === "true") {
        return "true";
      }

      if (normalized === "false") {
        return "false";
      }

      return "";
    }

    if (field.type === "date") {
      const rawString = String(rawValue);
      return rawString.length >= 10 ? rawString.slice(0, 10) : rawString;
    }

    if (field.type === "select") {
      const normalized = String(rawValue).trim().toLowerCase();
      if (field.key === "pool") {
        if (normalized === "true") {
          return "OUI";
        }
        if (normalized === "false") {
          return "NON";
        }
      }

      if (field.key === "garden") {
        if (normalized === "true") {
          return "OUI_NU";
        }
        if (normalized === "false") {
          return "NON";
        }
      }
    }

    return String(rawValue);
  }

  private parseFieldFormValue(rawValue: string, field: PropertyDetailsFieldDefinition): unknown {
    if (field.type === "boolean") {
      if (rawValue === "true") {
        return true;
      }
      if (rawValue === "false") {
        return false;
      }
      return null;
    }

    if (field.type === "number") {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        return null;
      }

      const parsed = Number(trimmed.replace(",", "."));
      if (Number.isNaN(parsed)) {
        throw new Error("invalid_number");
      }

      return parsed;
    }

    const trimmed = rawValue.trim();
    if (trimmed && field.type === "select") {
      if (field.key === "pool") {
        if (trimmed.toLowerCase() === "true") {
          return "OUI";
        }
        if (trimmed.toLowerCase() === "false") {
          return "NON";
        }
      }

      if (field.key === "garden") {
        if (trimmed.toLowerCase() === "true") {
          return "OUI_NU";
        }
        if (trimmed.toLowerCase() === "false") {
          return "NON";
        }
      }
    }
    return trimmed ? trimmed : null;
  }

  private isFieldValueEmpty(rawValue: unknown): boolean {
    if (rawValue === null || typeof rawValue === "undefined") {
      return true;
    }

    if (typeof rawValue === "string") {
      return rawValue.trim() === "";
    }

    return false;
  }

  private assignPropertyPatchValue(
    patchPayload: PropertyPatchRequest,
    key: string,
    value: string,
  ): void {
    switch (key) {
      case "title":
        patchPayload.title = value;
        break;
      case "city":
        patchPayload.city = value;
        break;
      case "postalCode":
        patchPayload.postalCode = value;
        break;
      case "address":
        patchPayload.address = value;
        break;
      default:
        break;
    }
  }

  private isAudioRecordingSupported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }

  private stopRecorderTracks(): void {
    this.mediaRecorder = null;

    if (!this.mediaStream) {
      return;
    }

    for (const track of this.mediaStream.getTracks()) {
      track.stop();
    }

    this.mediaStream = null;
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        const [, base64] = dataUrl.split(",");
        resolve(base64 ?? "");
      };

      reader.onerror = () => {
        reject(new Error("Impossible de lire l'enregistrement vocal."));
      };

      reader.readAsDataURL(blob);
    });
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        const [, base64] = dataUrl.split(",");
        resolve(base64 ?? "");
      };

      reader.onerror = () => {
        reject(new Error("Impossible de lire le fichier."));
      };

      reader.readAsDataURL(file);
    });
  }
}
