import { describe, expect, it } from "bun:test";
import { getPropertyRisks } from "../src/properties/georisques";

describe("getPropertyRisks", () => {
  it("retourne uniquement les liens georisques utiles", async () => {
    const calledUrls: string[] = [];

    const response = await getPropertyRisks({
      propertyId: "property_1",
      location: {
        address: "30 bd du val claret",
        postalCode: "06600",
        city: "Antibes",
        latitude: 43.596947,
        longitude: 7.124128,
      },
      fetchImpl: (async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();
        calledUrls.push(url);

        return new Response(JSON.stringify([{ nom: "Antibes", code: "06004" }]), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }) as typeof fetch,
    });

    expect(response.status).toBe("NO_DATA");
    expect(response.items).toEqual([]);
    expect(response.message).toContain("Consultez");
    expect(response.location.inseeCode).toBe("06004");
    expect(response.georisquesUrl).toContain(
      "/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2",
    );
    expect(response.georisquesUrl).toContain("city=Antibes");
    expect(response.georisquesUrl).toContain("codeInsee=06004");
    expect(response.georisquesUrl).toContain("lon=7.124128");
    expect(response.georisquesUrl).toContain("lat=43.596947");
    expect(response.reportPdfUrl).toContain("/api/v1/rapport_pdf");
    expect(response.reportPdfUrl).toContain("latlon=7.124128%2C43.596947");
    expect(calledUrls.length).toBe(1);
    expect(calledUrls[0]).toContain("https://geo.api.gouv.fr/communes");
  });

  it("retombe sur les liens meme si la resolution INSEE echoue", async () => {
    const previousFetch = globalThis.fetch;
    const response = await getPropertyRisks({
      propertyId: "property_2",
      location: {
        address: "11 rue basse",
        postalCode: "06250",
        city: "Mougins",
        latitude: null,
        longitude: null,
      },
      fetchImpl: Object.assign(
        async (): Promise<Response> => {
          throw new Error("network_down");
        },
        { preconnect: previousFetch.preconnect },
      ) as typeof fetch,
    });

    expect(response.status).toBe("NO_DATA");
    expect(response.items).toEqual([]);
    expect(response.location.inseeCode).toBeNull();
    expect(response.georisquesUrl).toContain("city=Mougins");
    expect(response.georisquesUrl).not.toContain("codeInsee=");
    expect(response.reportPdfUrl).toContain("adresse=11+rue+basse+06250+Mougins");
  });
});
