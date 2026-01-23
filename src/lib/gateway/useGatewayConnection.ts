"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GatewayClient,
  GatewayResponseError,
  GatewayStatus,
} from "./GatewayClient";

const DEFAULT_GATEWAY_URL = "ws://127.0.0.1:18789";
const STORAGE_URL_KEY = "clawdbot.gateway.url";
const STORAGE_TOKEN_KEY = "clawdbot.gateway.token";

const formatGatewayError = (error: unknown) => {
  if (error instanceof GatewayResponseError) {
    return `Gateway error (${error.code}): ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown gateway error.";
};

export type GatewayConnectionState = {
  client: GatewayClient;
  status: GatewayStatus;
  gatewayUrl: string;
  token: string;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  setGatewayUrl: (value: string) => void;
  setToken: (value: string) => void;
  clearError: () => void;
};

export const useGatewayConnection = (): GatewayConnectionState => {
  const [client] = useState(() => new GatewayClient());
  const didAutoConnect = useRef(false);

  const [gatewayUrl, setGatewayUrl] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_GATEWAY_URL;
    }
    return localStorage.getItem(STORAGE_URL_KEY) ?? DEFAULT_GATEWAY_URL;
  });
  const [token, setToken] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return localStorage.getItem(STORAGE_TOKEN_KEY) ?? "";
  });
  const [status, setStatus] = useState<GatewayStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.setItem(STORAGE_URL_KEY, gatewayUrl);
  }, [gatewayUrl]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
  }, [token]);

  useEffect(() => {
    return client.onStatus((nextStatus) => {
      setStatus(nextStatus);
      if (nextStatus !== "connecting") {
        setError(null);
      }
    });
  }, [client]);

  useEffect(() => {
    return () => {
      client.disconnect();
    };
  }, [client]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      await client.connect({ gatewayUrl, token });
    } catch (err) {
      setError(formatGatewayError(err));
    }
  }, [client, gatewayUrl, token]);

  useEffect(() => {
    if (didAutoConnect.current) return;
    if (!gatewayUrl.trim()) return;
    didAutoConnect.current = true;
    void connect();
  }, [connect, gatewayUrl]);

  const disconnect = useCallback(() => {
    setError(null);
    client.disconnect();
  }, [client]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    client,
    status,
    gatewayUrl,
    token,
    error,
    connect,
    disconnect,
    setGatewayUrl,
    setToken,
    clearError,
  };
};
