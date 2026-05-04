import { describe, it, expect, vi } from "vitest";
import { extractMediaCommandsFromAssistantRaw, emitMediaCommandsSseIfNeeded } from "./extract-media-commands.js";

const UUID_A = "672dbfea-662d-4781-8abc-c99fb4ec546f";
const UUID_B = "5784c76d-c494-4318-9f43-05be937f3d40";
const UUID_V = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("extractMediaCommandsFromAssistantRaw", () => {
  it("extrai um veículo (formato PPL típico)", () => {
    const raw = `ENVIAR_FOTOS_VEICULO: HONDA CITY 1.5 DX | id: ${UUID_A}`;
    const r = extractMediaCommandsFromAssistantRaw(raw);
    expect(r.photoInventoryIds).toEqual([UUID_A]);
    expect(r.photosSent).toEqual([{ id: UUID_A, name: "HONDA CITY 1.5 DX" }]);
    expect(r.videoInventoryIds).toEqual([]);
  });

  it("aceita ENVIAR_FOTO_VEICULO (S opcional no regex)", () => {
    const raw = `ENVIAR_FOTO_VEICULO: Gol | id: ${UUID_A}`;
    const r = extractMediaCommandsFromAssistantRaw(raw);
    expect(r.photoInventoryIds).toEqual([UUID_A]);
  });

  it("deduplica o mesmo id se o modelo repetir o comando", () => {
    const raw = `ENVIAR_FOTOS_VEICULO: A | id: ${UUID_A}\nENVIAR_FOTOS_VEICULO: A de novo | id: ${UUID_A}`;
    const r = extractMediaCommandsFromAssistantRaw(raw);
    expect(r.photoInventoryIds).toEqual([UUID_A]);
    expect(r.photosSent).toHaveLength(1);
  });

  it("extrai dois veículos distintos (caso cliente pediu fotos de dois carros)", () => {
    const raw = [
      `ENVIAR_FOTOS_VEICULO: HONDA CITY | id: ${UUID_A}`,
      `Opa! Segue o City.`,
      `ENVIAR_FOTOS_VEICULO: CHERY TIGGO | id: ${UUID_B}`,
      `E o Tiggo.`,
    ].join("\n");
    const r = extractMediaCommandsFromAssistantRaw(raw);
    expect(r.photoInventoryIds).toEqual([UUID_A, UUID_B]);
    expect(r.photosSent.map((p) => p.id)).toEqual([UUID_A, UUID_B]);
  });

  it("id case-insensitive (flag /gi)", () => {
    const raw = `ENVIAR_FOTOS_VEICULO: X | ID: ${UUID_A}`;
    const r = extractMediaCommandsFromAssistantRaw(raw);
    expect(r.photoInventoryIds).toEqual([UUID_A]);
  });

  it("extrai ENVIAR_VIDEO_DETALHES", () => {
    const raw = `ENVIAR_VIDEO_DETALHES: Civic | id: ${UUID_V}`;
    const r = extractMediaCommandsFromAssistantRaw(raw);
    expect(r.videoInventoryIds).toEqual([UUID_V]);
    expect(r.photoInventoryIds).toEqual([]);
  });

  it("foto + vídeo no mesmo texto", () => {
    const raw = `ENVIAR_FOTOS_VEICULO: A | id: ${UUID_A}\nENVIAR_VIDEO_DETALHES: B | id: ${UUID_V}`;
    const r = extractMediaCommandsFromAssistantRaw(raw);
    expect(r.photoInventoryIds).toEqual([UUID_A]);
    expect(r.videoInventoryIds).toEqual([UUID_V]);
  });

  it("não confunde uuid inválido (menos de 36)", () => {
    const raw = "ENVIAR_FOTOS_VEICULO: X | id: not-a-uuid";
    const r = extractMediaCommandsFromAssistantRaw(raw);
    expect(r.photoInventoryIds).toEqual([]);
  });
});

describe("emitMediaCommandsSseIfNeeded", () => {
  it("não chama sendSse quando não há comandos", () => {
    const send = vi.fn();
    const meta = emitMediaCommandsSseIfNeeded(send, "Só texto ao cliente.");
    expect(send).not.toHaveBeenCalled();
    expect(meta).toEqual([]);
  });

  it("emite media_commands com ids corretos", () => {
    const send = vi.fn();
    const raw = `ENVIAR_FOTOS_VEICULO: Carro | id: ${UUID_A}`;
    const meta = emitMediaCommandsSseIfNeeded(send, raw);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual({
      media_commands: { photo_inventory_ids: [UUID_A], video_inventory_ids: [] },
    });
    expect(meta).toEqual([{ id: UUID_A, name: "Carro" }]);
  });
});
