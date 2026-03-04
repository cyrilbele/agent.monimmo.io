import { TestBed } from "@angular/core/testing";
import { ApiClientService } from "../core/api-client.service";
import { AssistantService } from "./assistant.service";

describe("AssistantService", () => {
  it("appelle les routes assistant attendues", async () => {
    const calls: unknown[][] = [];

    TestBed.configureTestingModule({
      providers: [
        AssistantService,
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

    const service = TestBed.inject(AssistantService);

    await service.getConversation();
    await service.resetConversation();
    await service.sendMessage("Bonjour", {
      objectType: "bien",
      objectId: "bien_1",
    });

    expect(calls).toEqual([
      ["GET", "/assistant/conversation"],
      ["POST", "/assistant/conversation/reset", { body: {} }],
      [
        "POST",
        "/assistant/messages",
        {
          body: {
            message: "Bonjour",
            context: {
              objectType: "bien",
              objectId: "bien_1",
            },
          },
        },
      ],
    ]);
  });
});
