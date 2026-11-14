export const isQaPreview =
  new URLSearchParams(window.location.search).get("qa") === "1";

const qaStoragePrefix = "alfath-pos-qa:";

if (isQaPreview) {
  const storagePrototype = Storage.prototype as Storage & {
    __alfathQaStoragePatched?: boolean;
  };

  if (!storagePrototype.__alfathQaStoragePatched) {
    const nativeGetItem = Storage.prototype.getItem;
    const nativeSetItem = Storage.prototype.setItem;
    const nativeRemoveItem = Storage.prototype.removeItem;
    const nativeKey = Storage.prototype.key;
    const nativeLength = Object.getOwnPropertyDescriptor(
      Storage.prototype,
      "length",
    )?.get;

    const listQaKeys = (storage: Storage) => {
      const keys: string[] = [];
      const length = nativeLength?.call(storage) ?? 0;
      for (let index = 0; index < length; index += 1) {
        const key = nativeKey.call(storage, index);
        if (key?.startsWith(qaStoragePrefix)) {
          keys.push(key.slice(qaStoragePrefix.length));
        }
      }
      return keys;
    };

    Storage.prototype.getItem = function (key: string) {
      return nativeGetItem.call(this, `${qaStoragePrefix}${key}`);
    };
    Storage.prototype.setItem = function (key: string, value: string) {
      nativeSetItem.call(this, `${qaStoragePrefix}${key}`, value);
    };
    Storage.prototype.removeItem = function (key: string) {
      nativeRemoveItem.call(this, `${qaStoragePrefix}${key}`);
    };
    Storage.prototype.clear = function () {
      for (const key of listQaKeys(this)) {
        nativeRemoveItem.call(this, `${qaStoragePrefix}${key}`);
      }
    };
    Storage.prototype.key = function (index: number) {
      return listQaKeys(this)[index] ?? null;
    };
    if (nativeLength) {
      Object.defineProperty(Storage.prototype, "length", {
        configurable: true,
        enumerable: true,
        get() {
          return listQaKeys(this).length;
        },
      });
    }
    storagePrototype.__alfathQaStoragePatched = true;
  }

  const windowWithQaFlag = window as Window & {
    __alfathQaFetchPatched?: boolean;
  };
  if (!windowWithQaFlag.__alfathQaFetchPatched) {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.href
          : input;
      if (typeof rawUrl !== "string") return nativeFetch(input, init);

      let url: URL;
      try {
        url = new URL(rawUrl, window.location.href);
      } catch {
        return nativeFetch(input, init);
      }
      if (url.origin !== window.location.origin ||
          (url.pathname !== "/api" && !url.pathname.startsWith("/api/"))) {
        return nativeFetch(input, init);
      }

      url.pathname = `/qa-api${url.pathname}`;
      if (input instanceof Request) {
        return nativeFetch(new Request(url.href, input), init);
      }
      return nativeFetch(url.href, init);
    };
    windowWithQaFlag.__alfathQaFetchPatched = true;
  }
}
