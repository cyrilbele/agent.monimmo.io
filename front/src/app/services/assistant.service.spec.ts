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
    await service.confirmAction("action:1");
    await service.cancelAction("action:1");

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
      ["POST", "/assistant/actions/action%3A1/confirm", { body: {} }],
      ["POST", "/assistant/actions/action%3A1/cancel", { body: {} }],
    ]);
  });
});
