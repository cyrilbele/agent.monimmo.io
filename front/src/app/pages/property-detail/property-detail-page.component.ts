import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
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
import {
  Chart,
  registerables,
  type ChartDataset,
  type ScatterDataPoint,
} from "chart.js";

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
type RentalProfitabilityResult = {
  irrPct: number | null;
  reason: string | null;
  initialInvestment: number | null;
  annualNetCashflow: number | null;
  purchasePrice: number | null;
  notaryFeePct: number;
  notaryFeeAmount: number | null;
  annualPropertyTax: number;
  annualCoproFees: number;
  monthlyRent: number | null;
  holdingYears: number | null;
  resalePrice: number | null;
};

const DEFAULT_TYPE_DOCUMENT: TypeDocument = "PIECE_IDENTITE";
const FRONT_COMPARABLE_PRICE_TOLERANCE = 0.1;
const SALES_PAGE_SIZE = 10;
const COMPARABLE_TYPE_OPTIONS: Array<{ value: ComparablePropertyType; label: string }> = [
  { value: "APPARTEMENT", label: "Appartement" },
  { value: "MAISON", label: "Maison" },
  { value: "IMMEUBLE", label: "Immeuble" },
  { value: "TERRAIN", label: "Terrain" },
  { value: "LOCAL_COMMERCIAL", label: "Local commercial" },
  { value: "AUTRE", label: "Autre" },
];

@Component({
  selector: "app-property-detail-page",
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
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
  readonly salesPage = signal(1);
  readonly clients = signal<AccountUserResponse[]>([]);
  private comparablesChart: Chart<"scatter", ComparableScatterPoint[]> | null = null;
  private comparablesChartCanvas: HTMLCanvasElement | null = null;

  @ViewChild("comparablesChartCanvas")
  set comparablesChartCanvasRef(value: ElementRef<HTMLCanvasElement> | undefined) {
    this.comparablesChartCanvas = value?.nativeElement ?? null;
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
    return this.getDocumentTabDefinition(this.activeDocumentTab());
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
  readonly filteredComparableSalesSorted = computed(() =>
    this.filteredComparablePoints()
      .map((point) => ({
        point,
        saleTimestamp: this.parseComparableSaleTimestamp(point.saleDate) ?? Number.NEGATIVE_INFINITY,
      }))
      .sort((a, b) => b.saleTimestamp - a.saleTimestamp)
      .map((entry) => entry.point),
  );
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
  readonly comparablesFrontRegression = computed(() =>
    computeComparablesRegression(
      this.filteredComparablePoints().map((point) => ({
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
  readonly rentalProfitability = computed<RentalProfitabilityResult>(() => {
    const monthlyRent = this.rentalMonthlyRent();
    const holdingYears = this.rentalHoldingYears();
    const resalePrice = this.rentalResalePrice();
    const purchasePrice = this.resolveRentalPurchasePrice();
    const notaryFeePct = this.appSettingsService.notaryFeePct();
    const annualPropertyTax = this.resolveRentalAnnualPropertyTax();
    const annualCoproFees = this.resolveRentalAnnualCoproFees();
    const notaryFeeAmount =
      purchasePrice === null
        ? null
        : this.roundComparable((purchasePrice * notaryFeePct) / 100);

    if (purchasePrice === null) {
      return {
        irrPct: null,
        reason: "Prix d'achat indisponible sur ce bien.",
        initialInvestment: null,
        annualNetCashflow: null,
        purchasePrice,
        notaryFeePct,
        notaryFeeAmount,
        annualPropertyTax,
        annualCoproFees,
        monthlyRent,
        holdingYears,
        resalePrice,
      };
    }

    if (
      monthlyRent === null ||
      monthlyRent < 0 ||
      holdingYears === null ||
      holdingYears < 1 ||
      resalePrice === null ||
      resalePrice <= 0
    ) {
      return {
        irrPct: null,
        reason: "Renseignez loyer mensuel, duree de retention et prix de revente.",
        initialInvestment: null,
        annualNetCashflow: null,
        purchasePrice,
        notaryFeePct,
        notaryFeeAmount,
        annualPropertyTax,
        annualCoproFees,
        monthlyRent,
        holdingYears,
        resalePrice,
      };
    }

    const annualNetCashflow = monthlyRent * 12 - annualPropertyTax - annualCoproFees;
    const initialInvestment = purchasePrice + (notaryFeeAmount ?? 0);
    const cashflows: number[] = [-initialInvestment];

    for (let year = 1; year <= holdingYears; year += 1) {
      const yearlyCashflow = year === holdingYears ? annualNetCashflow + resalePrice : annualNetCashflow;
      cashflows.push(yearlyCashflow);
    }

    const irr = this.computeIrr(cashflows);
    return {
      irrPct: irr === null ? null : this.roundComparable(irr * 100),
      reason: irr === null ? "TRI non calculable avec ces flux." : null,
      initialInvestment: this.roundComparable(initialInvestment),
      annualNetCashflow: this.roundComparable(annualNetCashflow),
      purchasePrice,
      notaryFeePct,
      notaryFeeAmount,
      annualPropertyTax,
      annualCoproFees,
      monthlyRent,
      holdingYears,
      resalePrice,
    };
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
    const points = this.filteredComparablePoints();
    if (points.length === 0) {
      return null;
    }

    const xValues = points.map((point) => point.surfaceM2);
    const yValues = points.map((point) => point.salePrice);
    const regression = this.comparablesFrontRegression();

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
    this.salesPage.set(1);
    this.destroyComparablesChart();

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
      if (!this.comparables() && !this.comparablesLoading()) {
        void this.loadPropertyComparables();
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
        this.requestFeedback.set(`Le champ \"${field.label}\" doit etre un nombre valide.`);
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

    patchPayload.details = {
      [category.id]: categoryDetailsPayload,
    };

    this.patchPending.set(true);
    this.requestFeedback.set("Mise a jour des informations en cours...");

    try {
      const updated = await this.propertyService.patch(this.propertyId, patchPayload);
      this.property.set(updated);
      this.categoryForms.set(this.createCategoryForms(updated));
      this.editingPropertyCategory.set(null);
      this.requestFeedback.set("Informations mises a jour.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mise a jour impossible.";
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
      return "Non renseigne";
    }

    const rawValue = this.getFieldRawValue(property, categoryId, field);

    if (rawValue === null || typeof rawValue === "undefined" || rawValue === "") {
      return "Non renseigne";
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
      return option?.label ?? normalizedRaw;
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

  async updateStatus(status: PropertyStatus): Promise<void> {
    if (this.statusPending()) {
      return;
    }

    this.statusPending.set(true);
    this.requestFeedback.set("Mise a jour du statut en cours...");

    try {
      const updated = await this.propertyService.updateStatus(this.propertyId, status);
      this.property.set(updated);
      this.requestFeedback.set(`Statut mis a jour: ${this.statusLabels[updated.status]}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mise a jour impossible.";
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
    this.activeDocumentTab.set(tabId);

    const currentType = this.uploadForm.controls.typeDocument.value;
    const tab = this.getDocumentTabDefinition(tabId);

    if (!tab.typeDocuments.includes(currentType)) {
      this.uploadForm.controls.typeDocument.setValue(tab.typeDocuments[0] ?? DEFAULT_TYPE_DOCUMENT);
    }
  }

  isActiveDocumentTab(tabId: DocumentTabId): boolean {
    return this.activeDocumentTab() === tabId;
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
      this.uploadFeedback.set("Veuillez selectionner un fichier.");
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
      this.uploadFeedback.set("Document ajoute.");
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
      this.requestFeedback.set("Vocal ajoute. Transcription en file d'attente.");
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
            "Selectionnez un client existant dans la liste d'autocompletion.",
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
      this.prospectFeedback.set("Prospect ajoute.");
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
      this.visitFeedback.set("Renseignez les horaires de debut et de fin.");
      return;
    }

    const startsAtIso = this.toIsoFromDateTimeInput(startsAtRaw);
    const endsAtIso = this.toIsoFromDateTimeInput(endsAtRaw);

    if (!startsAtIso || !endsAtIso) {
      this.visitFeedback.set("Les horaires fournis sont invalides.");
      return;
    }

    if (new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
      this.visitFeedback.set("L'heure de fin doit etre apres l'heure de debut.");
      return;
    }

    this.visitPending.set(true);
    this.visitFeedback.set("Creation de la visite en cours...");

    try {
      let prospectUserId = "";
      const mode = this.visitProspectMode();

      if (mode === "existing") {
        const client = this.resolveSelectedVisitClient();

        if (!client) {
          this.visitFeedback.set(
            "Selectionnez un client existant dans la liste d'autocompletion.",
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
      this.requestFeedback.set("Visite ajoutee.");
      this.closeVisitModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Creation de visite impossible.";
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
        return "Proprietaire";
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

  async loadPropertyComparables(): Promise<void> {
    if (this.comparablesLoading()) {
      return;
    }

    this.comparablesLoading.set(true);
    this.comparablesError.set(null);

    try {
      const property = this.property();
      const propertyType = property ? this.resolveComparableTypeFromProperty(property) : undefined;
      const response = await this.propertyService.getComparables(this.propertyId, { propertyType });
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
        error instanceof Error ? error.message : "Chargement des donnees INSEE impossible.";
      this.inseeError.set(message);
    } finally {
      this.inseeLoading.set(false);
    }
  }

  onRentalMonthlyRentChange(rawValue: string): void {
    const parsed = this.parseOptionalNumber(rawValue);
    if (parsed === null || parsed < 0) {
      this.rentalMonthlyRent.set(null);
      return;
    }

    this.rentalMonthlyRent.set(this.roundComparable(parsed));
  }

  onRentalHoldingYearsChange(rawValue: string): void {
    const parsed = this.parseOptionalNumber(rawValue);
    if (parsed === null || parsed < 1) {
      this.rentalHoldingYears.set(null);
      return;
    }

    this.rentalHoldingYears.set(Math.max(1, Math.floor(parsed)));
  }

  onRentalResalePriceChange(rawValue: string): void {
    const parsed = this.parseOptionalNumber(rawValue);
    if (parsed === null || parsed <= 0) {
      this.rentalResalePrice.set(null);
      return;
    }

    this.rentalResalePrice.set(this.roundComparable(parsed));
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
      this.renderComparablesChart();
      return;
    }

    const parsed = this.parseComparableFilterValue(rawValue);
    const currentMax = this.comparableSurfaceMaxM2() ?? domain.max;
    if (parsed === null) {
      this.comparableSurfaceMinM2.set(domain.min);
      this.comparableSurfaceMaxM2.set(Math.max(currentMax, domain.min));
      this.renderComparablesChart();
      return;
    }

    const nextMin = this.roundComparable(Math.min(Math.max(parsed, domain.min), currentMax));
    this.comparableSurfaceMinM2.set(nextMin);
    this.comparableSurfaceMaxM2.set(Math.max(currentMax, nextMin));
    this.renderComparablesChart();
  }

  onComparableSurfaceMaxChange(rawValue: string): void {
    const domain = this.comparablesSurfaceDomain();
    if (!domain) {
      this.comparableSurfaceMaxM2.set(null);
      this.renderComparablesChart();
      return;
    }

    const parsed = this.parseComparableFilterValue(rawValue);
    const currentMin = this.comparableSurfaceMinM2() ?? domain.min;
    if (parsed === null) {
      this.comparableSurfaceMaxM2.set(domain.max);
      this.comparableSurfaceMinM2.set(Math.min(currentMin, domain.max));
      this.renderComparablesChart();
      return;
    }

    const nextMax = this.roundComparable(Math.max(Math.min(parsed, domain.max), currentMin));
    this.comparableSurfaceMaxM2.set(nextMax);
    this.comparableSurfaceMinM2.set(Math.min(currentMin, nextMax));
    this.renderComparablesChart();
  }

  onComparableTerrainMinChange(rawValue: string): void {
    const domain = this.comparablesTerrainDomain();
    if (!domain) {
      this.comparableTerrainMinM2.set(null);
      this.renderComparablesChart();
      return;
    }

    const parsed = this.parseComparableFilterValue(rawValue);
    const currentMax = this.comparableTerrainMaxM2() ?? domain.max;
    if (parsed === null) {
      this.comparableTerrainMinM2.set(domain.min);
      this.comparableTerrainMaxM2.set(Math.max(currentMax, domain.min));
      this.renderComparablesChart();
      return;
    }

    const nextMin = this.roundComparable(Math.min(Math.max(parsed, domain.min), currentMax));
    this.comparableTerrainMinM2.set(nextMin);
    this.comparableTerrainMaxM2.set(Math.max(currentMax, nextMin));
    this.renderComparablesChart();
  }

  onComparableTerrainMaxChange(rawValue: string): void {
    const domain = this.comparablesTerrainDomain();
    if (!domain) {
      this.comparableTerrainMaxM2.set(null);
      this.renderComparablesChart();
      return;
    }

    const parsed = this.parseComparableFilterValue(rawValue);
    const currentMin = this.comparableTerrainMinM2() ?? domain.min;
    if (parsed === null) {
      this.comparableTerrainMaxM2.set(domain.max);
      this.comparableTerrainMinM2.set(Math.min(currentMin, domain.max));
      this.renderComparablesChart();
      return;
    }

    const nextMax = this.roundComparable(Math.max(Math.min(parsed, domain.max), currentMin));
    this.comparableTerrainMaxM2.set(nextMax);
    this.comparableTerrainMinM2.set(Math.min(currentMin, nextMax));
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

  private renderComparablesChart(): void {
    const response = this.comparables();
    const chartDomains = this.comparablesChartDomains();
    const filteredPoints = this.filteredComparablePoints();
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

    const regression = this.comparablesFrontRegression();
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
    const defaultResalePrice = this.resolveRentalPurchasePriceFromProperty(property);

    this.rentalMonthlyRent.set(defaultMonthlyRent);
    this.rentalHoldingYears.set(10);
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

  private computeIrr(cashflows: number[]): number | null {
    if (cashflows.length < 2) {
      return null;
    }

    const hasPositive = cashflows.some((value) => value > 0);
    const hasNegative = cashflows.some((value) => value < 0);
    if (!hasPositive || !hasNegative) {
      return null;
    }

    const npv = (rate: number): number => {
      if (rate <= -1) {
        return Number.NaN;
      }

      return cashflows.reduce((total, cashflow, yearIndex) => {
        return total + cashflow / (1 + rate) ** yearIndex;
      }, 0);
    };

    const minRate = -0.95;
    const maxRate = 10;
    const scanSteps = 400;
    let lowerRate: number | null = null;
    let upperRate: number | null = null;
    let previousRate = minRate;
    let previousNpv = npv(previousRate);
    if (!Number.isFinite(previousNpv)) {
      return null;
    }

    for (let step = 1; step <= scanSteps; step += 1) {
      const currentRate = minRate + ((maxRate - minRate) * step) / scanSteps;
      const currentNpv = npv(currentRate);
      if (!Number.isFinite(currentNpv)) {
        continue;
      }

      if (previousNpv === 0) {
        return previousRate;
      }

      if (currentNpv === 0) {
        return currentRate;
      }

      if (previousNpv * currentNpv < 0) {
        lowerRate = previousRate;
        upperRate = currentRate;
        break;
      }

      previousRate = currentRate;
      previousNpv = currentNpv;
    }

    if (lowerRate === null || upperRate === null) {
      return null;
    }

    let low = lowerRate;
    let high = upperRate;
    let npvLow = npv(low);
    if (!Number.isFinite(npvLow)) {
      return null;
    }

    for (let iteration = 0; iteration < 80; iteration += 1) {
      const mid = (low + high) / 2;
      const npvMid = npv(mid);
      if (!Number.isFinite(npvMid)) {
        return null;
      }

      if (Math.abs(npvMid) < 1e-7) {
        return mid;
      }

      if (npvLow * npvMid <= 0) {
        high = mid;
      } else {
        low = mid;
        npvLow = npvMid;
      }
    }

    return (low + high) / 2;
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
      this.comparableSurfaceMinM2.set(surfaceDomain.min);
      this.comparableSurfaceMaxM2.set(surfaceDomain.max);

      const targetSurfaceM2 = this.resolveComparableTargetSurfaceM2(response);
      const rawLatestMin = targetSurfaceM2 === null ? surfaceDomain.min : targetSurfaceM2 * 0.95;
      const rawLatestMax = targetSurfaceM2 === null ? surfaceDomain.max : targetSurfaceM2 * 1.05;
      const latestMin = this.roundComparable(
        Math.min(Math.max(rawLatestMin, surfaceDomain.min), surfaceDomain.max),
      );
      const latestMax = this.roundComparable(
        Math.max(Math.min(rawLatestMax, surfaceDomain.max), latestMin),
      );
      this.latestSimilarSurfaceMinM2.set(latestMin);
      this.latestSimilarSurfaceMaxM2.set(latestMax);
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
    this.comparableTerrainMinM2.set(terrainDomainMin);
    this.comparableTerrainMaxM2.set(terrainDomainMax);

    const targetLandSurfaceM2 = this.resolveComparableTargetLandSurfaceM2();
    const rawLatestTerrainMin =
      targetLandSurfaceM2 === null ? terrainDomainMin : targetLandSurfaceM2 * 0.8;
    const rawLatestTerrainMax =
      targetLandSurfaceM2 === null ? terrainDomainMax : targetLandSurfaceM2 * 1.2;
    const latestTerrainMin = this.roundComparable(
      Math.min(Math.max(rawLatestTerrainMin, terrainDomainMin), terrainDomainMax),
    );
    const latestTerrainMax = this.roundComparable(
      Math.max(Math.min(rawLatestTerrainMax, terrainDomainMax), latestTerrainMin),
    );
    this.latestSimilarTerrainMinM2.set(latestTerrainMin);
    this.latestSimilarTerrainMaxM2.set(latestTerrainMax);
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
