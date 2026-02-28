import { TestBed } from "@angular/core/testing";
import { ApiClientService } from "../core/api-client.service";
import { FileService } from "./file.service";
import { MessageService } from "./message.service";
import { UserService } from "./user.service";
import { VocalService } from "./vocal.service";

describe("service API wrappers", () => {
  it("file/message/vocal utilisent les bonnes routes", async () => {
    const calls: unknown[][] = [];

    TestBed.configureTestingModule({
      providers: [
        FileService,
        MessageService,
        VocalService,
        {
          provide: ApiClientService,
          useValue: {
            request: (...args: unknown[]) => {
              calls.push(args);
              return Promise.resolve({});
            },
          },
        },
      ],
    });

    const fileService = TestBed.inject(FileService);
    const messageService = TestBed.inject(MessageService);
    const vocalService = TestBed.inject(VocalService);

    await fileService.listByProperty("property:1");
    await fileService.upload({
      propertyId: "property_1",
      typeDocument: "DPE",
      fileName: "diag.pdf",
      mimeType: "application/pdf",
      size: 123,
    });
    await fileService.getDownloadUrl("file:1");
    await messageService.listByProperty("property:1");
    await vocalService.list();
    await vocalService.upload({
      fileName: "vocal.m4a",
      mimeType: "audio/mp4",
      size: 321,
      contentBase64: "Zm9v",
      propertyId: "property_1",
    });
    await vocalService.getById("vocal:1");
    await vocalService.enqueueTranscription("vocal:1");

    expect(calls).toEqual([
      ["GET", "/files", { params: { propertyId: "property:1", limit: 100 } }],
      [
        "POST",
        "/files/upload",
        {
          body: {
            propertyId: "property_1",
            typeDocument: "DPE",
            fileName: "diag.pdf",
            mimeType: "application/pdf",
            size: 123,
          },
        },
      ],
      ["GET", "/files/file%3A1/download-url"],
      ["GET", "/messages", { params: { propertyId: "property:1", limit: 100 } }],
      ["GET", "/vocals", { params: { limit: 100 } }],
      [
        "POST",
        "/vocals/upload",
        {
          body: {
            fileName: "vocal.m4a",
            mimeType: "audio/mp4",
            size: 321,
            contentBase64: "Zm9v",
            propertyId: "property_1",
          },
        },
      ],
      ["GET", "/vocals/vocal%3A1"],
      ["POST", "/vocals/vocal%3A1/transcribe"],
    ]);
  });

  it("user service normalise la limite et appelle les routes CRUD", async () => {
    const calls: unknown[][] = [];

    TestBed.configureTestingModule({
      providers: [
        UserService,
        {
          provide: ApiClientService,
          useValue: {
            request: (...args: unknown[]) => {
              calls.push(args);
              return Promise.resolve({});
            },
          },
        },
      ],
    });

    const userService = TestBed.inject(UserService);

    await userService.list(Number.NaN, "martin", "CLIENT");
    await userService.list(-3);
    await userService.list(999);
    await userService.getById("user:1");
    await userService.create({
      firstName: "Lise",
      lastName: "Martin",
      email: "lise@demo.fr",
      accountType: "CLIENT",
    });
    await userService.patch("user:1", {
      city: "Paris",
    });

    expect(calls).toEqual([
      ["GET", "/users", { params: { limit: 100, q: "martin", accountType: "CLIENT" } }],
      ["GET", "/users", { params: { limit: 1, q: undefined, accountType: undefined } }],
      ["GET", "/users", { params: { limit: 100, q: undefined, accountType: undefined } }],
      ["GET", "/users/user%3A1"],
      [
        "POST",
        "/users",
        {
          body: {
            firstName: "Lise",
            lastName: "Martin",
            email: "lise@demo.fr",
            accountType: "CLIENT",
          },
        },
      ],
      ["PATCH", "/users/user%3A1", { body: { city: "Paris" } }],
    ]);
  });
});
