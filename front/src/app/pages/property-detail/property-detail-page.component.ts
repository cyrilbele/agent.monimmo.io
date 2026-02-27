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
import { MessageService } from "../../services/message.service";
import { PropertyService } from "../../services/property.service";
import { UserService } from "../../services/user.service";
import { VocalService } from "../../services/vocal.service";

type MainTabId =
  | "property"
  | "documents"
  | "prospects"
  | "visits"
  | "messages"
  | "risks";
type ProspectMode = "existing" | "new";
type VisitProspectMode = "existing" | "new";
type CategoryControls = Record<string, FormControl<string>>;
type CategoryForm = FormGroup<CategoryControls>;
type CategoryForms = Record<PropertyDetailsCategoryId, CategoryForm>;

const DEFAULT_TYPE_DOCUMENT: TypeDocument = "PIECE_IDENTITE";

@Component({
  selector: "app-property-detail-page",
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: "./property-detail-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertyDetailPageComponent implements OnInit, OnDestroy {
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly propertyService = inject(PropertyService);
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
  readonly clients = signal<AccountUserResponse[]>([]);

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
    this.stopRecorderTracks();
  }

  async loadPropertyBundle(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.risks.set(null);
    this.risksError.set(null);
    this.risksLoading.set(false);

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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Chargement des risques impossible.";
      this.risksError.set(message);
    } finally {
      this.risksLoading.set(false);
    }
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
