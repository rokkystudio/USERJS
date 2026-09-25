// GPT_MODEL_PICKER.js v1.0.12
(() => {
    'use strict';

    const GLOBAL_KEY = '__gptModelPicker';

    if (window[GLOBAL_KEY] && typeof window[GLOBAL_KEY].stop === 'function') {
        window[GLOBAL_KEY].stop();
    }

    const config = {
        /** Версия файла и панели. */
        version: '1.0.12',

        /** URL backend-метода со списком моделей режима Work. */
        workModelsUrl: '/backend-api/tpp/models/?supports_model_picker_upgrade_presets=true',

        /** URL backend-метода со списком моделей обычного ChatGPT. */
        chatModelsUrl: '/backend-api/models?iim=false&is_gizmo=false&supports_model_picker_upgrade_presets=true',

        /** Путь запроса создания нового хода разговора. */
        conversationPath: '/backend-api/f/conversation',

        /** Значение выбора, при котором скрипт не меняет slug модели. */
        autoModelSlug: 'auto',

        /** Ключ выбранной модели в localStorage. */
        storageKey: 'gpt-model-picker.selected-model.v2',

        /** Ключ выбранной глубины рассуждения в localStorage. */
        thinkingEffortStorageKey: 'gpt-model-picker.thinking-effort.v1',

        /** Ключ режима ускоренной обработки в localStorage. */
        fastModeStorageKey: 'gpt-model-picker.fast-mode.v1',

        /** Ключ переключателя Chat Mode в localStorage. */
        forceChatStorageKey: 'gpt-model-picker.force-chat.v1',

        /** Ключ позиции панели в localStorage. */
        positionStorageKey: 'gpt-model-picker.position.v1',

        /** Ключ состояния свёрнутой панели в localStorage. */
        collapsedStorageKey: 'gpt-model-picker.collapsed.v1',

        /** Ключ пользовательского размера панели в localStorage. */
        sizeStorageKey: 'gpt-model-picker.size.v1',

        /** Период проверки и автоматического восстановления перехватчика window.fetch. */
        hookCheckIntervalMs: 1000,

        /** Количество повторных загрузок каталогов после ошибки. */
        catalogRetryCount: 2,

        /** Задержка между повторными загрузками каталогов. */
        catalogRetryDelayMs: 1500,

        /** Включает диагностические сообщения в консоли браузера. */
        debug: true
    };

    const thinkingEffortOptions = [
        { value: 'auto', label: 'Auto — не вмешиваться' },
        { value: 'min', label: 'Лёгкое — min' },
        { value: 'standard', label: 'Стандартное — standard' },
        { value: 'extended', label: 'Усиленное — extended' },
        { value: 'xhigh', label: 'Очень высокое — xhigh' },
        { value: 'max', label: 'Тяжёлое — max' },
        { value: 'ultra', label: 'Ultra — ultra' }
    ];

    const historicalModels = [
        { slug: 'gpt-5-5-instant', title: 'GPT-5.5 Instant', badge: '[история]' },
        { slug: 'gpt-5-6-instant', title: 'GPT-5.6 Sol', badge: '[история]' },
        { slug: 'gpt-5-5-thinking', title: 'GPT-5.5 Thinking', badge: '[история]' },
        { slug: 'gpt-5-6-thinking', title: 'GPT-5.6 Sol', badge: '[история]' },
        { slug: 'gpt-5-4-mini', title: 'GPT-5.4 Thinking Mini', badge: '[история]' },
        { slug: 'gpt-5-6-t-mini', title: 'GPT-5.6 Luna', badge: '[история]' },
        { slug: 'research', title: 'Deep Research', badge: '[история]' }
    ];

    const experimentalApiModels = [
        { slug: 'gpt-6-astra', title: 'GPT-6 Astra', badge: '[API-only]' },
        { slug: 'gpt-6-sol', title: 'GPT-6 Sol', badge: '[API-only]' },
        { slug: 'gpt-6-luna', title: 'GPT-6 Luna', badge: '[API-only]' },
        { slug: 'gpt-5.6-sol', title: 'GPT-5.6 Sol', badge: '[API-only]' },
        { slug: 'gpt-5.6-terra', title: 'GPT-5.6 Terra', badge: '[API-only]' },
        { slug: 'gpt-5.6-luna', title: 'GPT-5.6 Luna', badge: '[API-only]' },
        { slug: 'gpt-image-2.5-sunburst', title: 'GPT-Image-2.5 Sunburst', badge: '[API-only]' },
        { slug: 'gpt-image-2.5-flare', title: 'GPT-Image-2.5 Flare', badge: '[API-only]' },
        { slug: 'gpt-image-2', title: 'GPT-Image-2', badge: '[API-only]' },
        { slug: 'gpt-live-1', title: 'GPT-Live 1', badge: '[API-only]' },
        { slug: 'gpt-realtime-2.1', title: 'GPT-Realtime-2.1', badge: '[API-only]' },
        { slug: 'gpt-realtime-2.1-mini', title: 'GPT-Realtime-2.1 Mini', badge: '[API-only]' },
        { slug: 'gpt-realtime-2', title: 'GPT-Realtime-2', badge: '[API-only]' },
        { slug: 'gpt-realtime-translate', title: 'GPT-Realtime-Translate', badge: '[API-only]' },
        { slug: 'gpt-live-transcribe', title: 'GPT-Live-Transcribe', badge: '[API-only]' },
        { slug: 'gpt-realtime-whisper', title: 'GPT-Realtime-Whisper', badge: '[API-only]' },
        { slug: 'gpt-realtime-1.5', title: 'GPT-Realtime-1.5', badge: '[API-only]' },
        { slug: 'gpt-audio-1.5', title: 'GPT-Audio-1.5', badge: '[API-only]' },
        { slug: 'gpt-transcribe', title: 'GPT-Transcribe', badge: '[API-only]' },
        { slug: 'gpt-4o-transcribe', title: 'GPT-4o Transcribe', badge: '[API-only]' },
        { slug: 'gpt-4o-mini-transcribe', title: 'GPT-4o Mini Transcribe', badge: '[API-only]' },
        { slug: 'gpt-4o-transcribe-diarize', title: 'GPT-4o Transcribe Diarize', badge: '[API-only]' },
        { slug: 'tts-1', title: 'TTS-1', badge: '[API-only]' },
        { slug: 'tts-1-hd', title: 'TTS-1 HD', badge: '[API-only]' },
        { slug: 'whisper-1', title: 'Whisper', badge: '[API-only]' },
        { slug: 'gpt-4o-mini-tts', title: 'GPT-4o Mini TTS', badge: '[API-only]' },
        { slug: 'gpt-5.6-cyber', title: 'GPT-5.6 Cyber', badge: '[API-only]' },
        { slug: 'daybreak-red', title: 'Daybreak Red', badge: '[API-only]' },
        { slug: 'daybreak-blue', title: 'Daybreak Blue', badge: '[API-only]' },
        { slug: 'gpt-rosalind', title: 'GPT-Rosalind', badge: '[API-only]' },
        { slug: 'gpt-oss-120b', title: 'gpt-oss-120b', badge: '[API-only]' },
        { slug: 'gpt-oss-20b', title: 'gpt-oss-20b', badge: '[API-only]' },
        { slug: 'text-embedding-3-large', title: 'text-embedding-3-large', badge: '[API-only]' },
        { slug: 'text-embedding-3-small', title: 'text-embedding-3-small', badge: '[API-only]' },
        { slug: 'text-embedding-ada-002', title: 'text-embedding-ada-002', badge: '[API-only]' },
        { slug: 'gpt-5.5', title: 'GPT-5.5', badge: '[API-only]' },
        { slug: 'gpt-5.5-pro', title: 'GPT-5.5 Pro', badge: '[API-only]' },
        { slug: 'gpt-5.4', title: 'GPT-5.4', badge: '[API-only]' },
        { slug: 'gpt-5.4-pro', title: 'GPT-5.4 Pro', badge: '[API-only]' },
        { slug: 'gpt-5.4-mini', title: 'GPT-5.4 Mini', badge: '[API-only]' },
        { slug: 'gpt-5.4-nano', title: 'GPT-5.4 nano', badge: '[API-only]' },
        { slug: 'gpt-5.3-codex', title: 'GPT-5.3-Codex', badge: '[API-only]' },
        { slug: 'gpt-5.2', title: 'GPT-5.2', badge: '[API-only]' },
        { slug: 'gpt-5.2-pro', title: 'GPT-5.2 Pro', badge: '[API-only]' },
        { slug: 'gpt-5.1', title: 'GPT-5.1', badge: '[API-only]' },
        { slug: 'gpt-5', title: 'GPT-5', badge: '[API-only]' },
        { slug: 'gpt-5-mini', title: 'GPT-5 Mini', badge: '[API-only]' },
        { slug: 'gpt-5-nano', title: 'GPT-5 nano', badge: '[API-only]' },
        { slug: 'gpt-5-pro', title: 'GPT-5 Pro', badge: '[API-only]' },
        { slug: 'o3-pro', title: 'o3-pro', badge: '[API-only]' },
        { slug: 'o3', title: 'o3', badge: '[API-only]' },
        { slug: 'gpt-4.1', title: 'GPT-4.1', badge: '[API-only]' },
        { slug: 'gpt-4.1-mini', title: 'GPT-4.1 Mini', badge: '[API-only]' },
        { slug: 'omni-moderation-latest', title: 'omni-moderation', badge: '[API-only]' },
        { slug: 'gpt-4o-mini', title: 'GPT-4o Mini', badge: '[API-only]' },
        { slug: 'gpt-4o', title: 'GPT-4o', badge: '[API-only]' },
        { slug: 'gpt-realtime', title: 'GPT-Realtime', badge: '[API-only]' },
        { slug: 'gpt-audio', title: 'GPT-Audio', badge: '[API-only]' },
        { slug: 'gpt-5.3-chat-latest', title: 'GPT-5.3 Chat', badge: '[API-only]' },
        { slug: 'gpt-5.2-chat-latest', title: 'GPT-5.2 Chat', badge: '[API-only]' },
        { slug: 'gpt-5.2-codex', title: 'GPT-5.2-Codex', badge: '[API-only]' },
        { slug: 'sora-2', title: 'Sora 2', badge: '[API-only]' },
        { slug: 'sora-2-pro', title: 'Sora 2 Pro', badge: '[API-only]' },
        { slug: 'gpt-image-1.5', title: 'GPT-Image-1.5', badge: '[API-only]' },
        { slug: 'chatgpt-image-latest', title: 'chatgpt-image-latest', badge: '[API-only]' },
        { slug: 'gpt-image-1-mini', title: 'GPT-Image-1 Mini', badge: '[API-only]' },
        { slug: 'gpt-image-1', title: 'GPT-Image-1', badge: '[API-only]' },
        { slug: 'o3-deep-research', title: 'o3-deep-research', badge: '[API-only]' },
        { slug: 'o4-mini-deep-research', title: 'o4-mini-deep-research', badge: '[API-only]' },
        { slug: 'gpt-4.1-nano', title: 'GPT-4.1 nano', badge: '[API-only]' },
        { slug: 'o4-mini', title: 'o4-mini', badge: '[API-only]' },
        { slug: 'o1-pro', title: 'o1-pro', badge: '[API-only]' },
        { slug: 'computer-use-preview', title: 'computer-use-preview', badge: '[API-only]' },
        { slug: 'gpt-realtime-mini', title: 'GPT-Realtime Mini', badge: '[API-only]' },
        { slug: 'gpt-audio-mini', title: 'GPT-Audio Mini', badge: '[API-only]' },
        { slug: 'gpt-4o-mini-search-preview', title: 'GPT-4o Mini Search Preview', badge: '[API-only]' },
        { slug: 'gpt-4o-search-preview', title: 'GPT-4o Search Preview', badge: '[API-only]' },
        { slug: 'gpt-4.5-preview', title: 'GPT-4.5 Preview', badge: '[API-only]' },
        { slug: 'o3-mini', title: 'o3-mini', badge: '[API-only]' },
        { slug: 'o1', title: 'o1', badge: '[API-only]' },
        { slug: 'o1-mini', title: 'o1-mini', badge: '[API-only]' },
        { slug: 'o1-preview', title: 'o1 Preview', badge: '[API-only]' },
        { slug: 'gpt-4o-audio-preview', title: 'GPT-4o Audio', badge: '[API-only]' },
        { slug: 'gpt-4o-mini-audio-preview', title: 'GPT-4o Mini Audio', badge: '[API-only]' },
        { slug: 'gpt-4o-mini-realtime-preview', title: 'GPT-4o Mini Realtime', badge: '[API-only]' },
        { slug: 'gpt-4o-realtime-preview', title: 'GPT-4o Realtime', badge: '[API-only]' },
        { slug: 'gpt-4-turbo', title: 'GPT-4 Turbo', badge: '[API-only]' },
        { slug: 'babbage-002', title: 'babbage-002', badge: '[API-only]' },
        { slug: 'chatgpt-4o-latest', title: 'ChatGPT-4o', badge: '[API-only]' },
        { slug: 'gpt-5.1-codex', title: 'GPT-5.1-Codex', badge: '[API-only]' },
        { slug: 'gpt-5.1-codex-max', title: 'GPT-5.1-Codex-Max', badge: '[API-only]' },
        { slug: 'gpt-5.1-codex-mini', title: 'GPT-5.1-Codex Mini', badge: '[API-only]' },
        { slug: 'gpt-5-codex', title: 'GPT-5-Codex', badge: '[API-only]' },
        { slug: 'codex-mini-latest', title: 'codex-mini-latest', badge: '[API-only]' },
        { slug: 'davinci-002', title: 'davinci-002', badge: '[API-only]' },
        { slug: 'gpt-3.5-turbo', title: 'GPT-3.5 Turbo', badge: '[API-only]' },
        { slug: 'gpt-4', title: 'GPT-4', badge: '[API-only]' },
        { slug: 'gpt-4-turbo-preview', title: 'GPT-4 Turbo Preview', badge: '[API-only]' },
        { slug: 'gpt-5.1-chat-latest', title: 'GPT-5.1 Chat', badge: '[API-only]' },
        { slug: 'gpt-5-chat-latest', title: 'GPT-5 Chat', badge: '[API-only]' },
        { slug: 'text-moderation-latest', title: 'text-moderation', badge: '[API-only]' },
        { slug: 'text-moderation-stable', title: 'text-moderation-stable', badge: '[API-only]' }
    ];
    const state = {
        baseFetch: window.fetch,
        downstreamFetch: window.fetch,
        originalFetchDescriptor: Object.getOwnPropertyDescriptor(window, 'fetch'),
        fetchGuardInstalled: false,
        downstreamReplacementCount: 0,
        downstreamCallDepth: 0,
        selectedModelSlug: '',
        selectedThinkingEffort: 'auto',
        fastModeEnabled: false,
        forceChatEnabled: true,
        workModels: [],
        chatModels: [],
        workDefaultModelSlug: '',
        panel: null,
        header: null,
        collapseButton: null,
        select: null,
        input: null,
        thinkingSelect: null,
        fastCheckbox: null,
        forceChatCheckbox: null,
        hookStatus: null,
        catalogStatus: null,
        selectedStatus: null,
        requestStatus: null,
        backendStatus: null,
        hookTimer: null,
        resizeObserver: null,
        navigationLinkObserver: null,
        navigationMenuObserver: null,
        navigationContextMenuHandler: null,
        dragState: null,
        collapsed: false,
        lastRequestedModelSlug: '',
        lastResolvedModelSlug: '',
        stopped: false
    };

    /**
     * Выводит диагностическое сообщение с префиксом скрипта.
     *
     * @param {...any} args
     */
    function log(...args) {
        if (config.debug) {
            console.debug('[GPT MODEL PICKER]', ...args);
        }
    }

    /**
     * Возвращает путь запроса без origin и query-параметров.
     *
     * @param {RequestInfo | URL} input
     * @returns {string}
     */
    function getRequestPath(input) {
        const rawUrl = input instanceof Request ? input.url : String(input);

        return new URL(rawUrl, window.location.origin).pathname;
    }

    /**
     * Вызывает текущую штатную обёртку fetch и ограничивает защиту от рекурсии
     * только синхронным вызовом нижнего слоя. Параллельные fetch-запросы не
     * отключают перехват друг для друга на время ожидания Promise.
     *
     * @param {RequestInfo | URL} input
     * @param {RequestInit | undefined} init
     * @returns {Promise<Response>}
     */
    function callDownstreamFetch(input, init) {
        if (state.downstreamCallDepth > 0) {
            return state.baseFetch.call(window, input, init);
        }

        state.downstreamCallDepth += 1;

        try {
            return state.downstreamFetch.call(window, input, init);
        } finally {
            state.downstreamCallDepth -= 1;
        }
    }

    /**
     * Возвращает JSON-тело запроса и функцию создания запроса с новым телом.
     *
     * @param {RequestInfo | URL} input
     * @param {RequestInit | undefined} init
     * @returns {Promise<{ body: string, rebuild: (body: string) => Request | [RequestInfo | URL, RequestInit] } | null>}
     */
    async function readRequestBody(input, init) {
        if (init && typeof init.body === 'string') {
            return {
                body: init.body,
                rebuild(body) {
                    return [input, { ...init, body }];
                }
            };
        }

        if (input instanceof Request) {
            return {
                body: await input.clone().text(),
                rebuild(body) {
                    return new Request(input, { body });
                }
            };
        }

        return null;
    }

    /**
     * Изменяет модель, глубину рассуждения, скорость и режим разговора в JSON payload.
     *
     * Режим «Не изменять модель» сохраняет исходный model slug. Значение thinking effort Auto
     * сохраняет штатный thinking_effort. Включённая скорость задаёт
     * service_tier=priority, выключенная сохраняет штатный tier. При включённом
     * Chat Mode и ручном выборе модели обычный primary_assistant ход остаётся
     * Chat: задаётся primary_assistant, явно передаётся conversation_origin=null
     * и исключается Work execution target. Метаданные нового user-сообщения
     * также не передают conversation_execution_target. Выключенный Chat Mode
     * оставляет режим разговора штатным. Gizmo-режимы не преобразуются.
     *
     * @param {string} body
     * @returns {{ body: string, changed: boolean, originalModelSlug: string, requestedModelSlug: string, originalThinkingEffort: string, requestedThinkingEffort: string, originalServiceTier: string, requestedServiceTier: string, originalConversationOrigin: string, originalConversationMode: string, requestedConversationMode: string } | null}
     */
    function updateConversationBody(body) {
        if (!body) {
            return null;
        }

        let payload;

        try {
            payload = JSON.parse(body);
        } catch {
            return null;
        }

        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return null;
        }

        const originalModelSlug = String(
            payload.model || payload.model_slug || payload.requested_model_slug || ''
        );
        const originalThinkingEffort = String(
            payload.thinking_effort || payload.backend_thinking_effort || ''
        );
        const originalServiceTier = String(
            payload.service_tier || payload.backend_service_tier || ''
        );
        const originalConversationOrigin = String(payload.conversation_origin || '');
        const originalConversationMode = String(payload.conversation_mode?.kind || '');
        const overrideModel = state.selectedModelSlug !== config.autoModelSlug;
        const overrideThinkingEffort = state.selectedThinkingEffort !== 'auto';
        const forceChat = state.forceChatEnabled
            && overrideModel
            && (!originalConversationMode || originalConversationMode === 'primary_assistant');
        let changed = false;

        if (overrideModel) {
            if (payload.model !== state.selectedModelSlug) {
                changed = true;
            }

            payload.model = state.selectedModelSlug;

            if (Object.prototype.hasOwnProperty.call(payload, 'model_slug')) {
                if (payload.model_slug !== state.selectedModelSlug) {
                    changed = true;
                }

                payload.model_slug = state.selectedModelSlug;
            }

            if (Object.prototype.hasOwnProperty.call(payload, 'requested_model_slug')) {
                if (payload.requested_model_slug !== state.selectedModelSlug) {
                    changed = true;
                }

                payload.requested_model_slug = state.selectedModelSlug;
            }

            if (Object.prototype.hasOwnProperty.call(payload, 'backend_model')) {
                if (payload.backend_model !== state.selectedModelSlug) {
                    changed = true;
                }

                payload.backend_model = state.selectedModelSlug;
            }
        }

        if (forceChat) {
            if (payload.conversation_mode?.kind !== 'primary_assistant' || Object.keys(payload.conversation_mode || {}).length !== 1) {
                payload.conversation_mode = { kind: 'primary_assistant' };
                changed = true;
            }

            if (!Object.prototype.hasOwnProperty.call(payload, 'conversation_origin') || payload.conversation_origin !== null) {
                payload.conversation_origin = null;
                changed = true;
            }

            if (Object.prototype.hasOwnProperty.call(payload, 'chat_mode') && payload.chat_mode !== 'chat') {
                payload.chat_mode = 'chat';
                changed = true;
            }

            if (Object.prototype.hasOwnProperty.call(payload, 'tpp_work_handoff_conversion')) {
                delete payload.tpp_work_handoff_conversion;
                changed = true;
            }

            if (Object.prototype.hasOwnProperty.call(payload, 'conversation_execution_target')) {
                delete payload.conversation_execution_target;
                changed = true;
            }

            if (Array.isArray(payload.messages)) {
                for (const message of payload.messages) {
                    if (
                        message?.author?.role === 'user'
                        && message.metadata
                        && Object.prototype.hasOwnProperty.call(message.metadata, 'conversation_execution_target')
                    ) {
                        delete message.metadata.conversation_execution_target;
                        changed = true;
                    }
                }
            }
        }

        if (overrideThinkingEffort) {
            if (payload.thinking_effort !== state.selectedThinkingEffort) {
                changed = true;
            }

            payload.thinking_effort = state.selectedThinkingEffort;

            if (Object.prototype.hasOwnProperty.call(payload, 'backend_thinking_effort')) {
                if (payload.backend_thinking_effort !== state.selectedThinkingEffort) {
                    changed = true;
                }

                payload.backend_thinking_effort = state.selectedThinkingEffort;
            }
        }

        if (state.fastModeEnabled) {
            if (payload.service_tier !== 'priority') {
                changed = true;
            }

            payload.service_tier = 'priority';

            if (Object.prototype.hasOwnProperty.call(payload, 'backend_service_tier')) {
                if (payload.backend_service_tier !== 'priority') {
                    changed = true;
                }

                payload.backend_service_tier = 'priority';
            }
        }

        return {
            body: changed ? JSON.stringify(payload) : body,
            changed,
            originalModelSlug,
            requestedModelSlug: overrideModel ? state.selectedModelSlug : originalModelSlug,
            originalThinkingEffort,
            requestedThinkingEffort: overrideThinkingEffort ? state.selectedThinkingEffort : originalThinkingEffort,
            originalServiceTier,
            requestedServiceTier: state.fastModeEnabled ? 'priority' : originalServiceTier,
            originalConversationOrigin,
            originalConversationMode,
            requestedConversationMode: forceChat ? 'chat' : originalConversationMode
        };
    }

    /**
     * Добавляет непустое строковое значение в массив без повторений.
     *
     * @param {string[]} target
     * @param {unknown} value
     */
    function appendUniqueString(target, value) {
        if (typeof value === 'string' && value && !target.includes(value)) {
            target.push(value);
        }
    }

    /**
     * Собирает сведения о модели, thinking effort и service tier из JSON-объекта ответа.
     *
     * @param {unknown} value
     * @param {{ resolvedModels: string[], assistantModels: string[], allModels: string[], thinkingEfforts: string[], serviceTiers: string[] }} result
     */
    function collectResponseInfo(value, result) {
        if (!value || typeof value !== 'object') {
            return;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                collectResponseInfo(item, result);
            }

            return;
        }

        appendUniqueString(result.resolvedModels, value.resolved_model_slug);
        appendUniqueString(result.allModels, value.model_slug);
        appendUniqueString(result.thinkingEfforts, value.thinking_effort);
        appendUniqueString(result.thinkingEfforts, value.backend_thinking_effort);
        appendUniqueString(result.serviceTiers, value.service_tier);
        appendUniqueString(result.serviceTiers, value.backend_service_tier);

        if (value.author?.role === 'assistant' && value.metadata) {
            appendUniqueString(result.resolvedModels, value.metadata.resolved_model_slug);
            appendUniqueString(result.assistantModels, value.metadata.model_slug);
            appendUniqueString(result.thinkingEfforts, value.metadata.thinking_effort);
            appendUniqueString(result.serviceTiers, value.metadata.service_tier);
        }

        for (const nestedValue of Object.values(value)) {
            collectResponseInfo(nestedValue, result);
        }
    }

    /**
     * Возвращает сведения, раскрытые backend-событиями потокового ответа.
     *
     * @param {string} responseText
     * @returns {{ modelSlug: string, thinkingEffort: string, serviceTier: string }}
     */
    function extractResponseInfo(responseText) {
        const result = {
            resolvedModels: [],
            assistantModels: [],
            allModels: [],
            thinkingEfforts: [],
            serviceTiers: []
        };

        for (const line of responseText.split(/\r?\n/)) {
            const trimmedLine = line.trim();

            if (!trimmedLine || trimmedLine === 'data: [DONE]') {
                continue;
            }

            const jsonText = trimmedLine.startsWith('data:')
                ? trimmedLine.slice(5).trim()
                : trimmedLine;

            if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
                continue;
            }

            try {
                collectResponseInfo(JSON.parse(jsonText), result);
            } catch {
                continue;
            }
        }

        return {
            modelSlug: result.resolvedModels.at(-1) || result.assistantModels.at(-1) || result.allModels.at(-1) || '',
            thinkingEffort: result.thinkingEfforts.at(-1) || '',
            serviceTier: result.serviceTiers.at(-1) || ''
        };
    }

    /**
     * Возвращает компактное отображение service tier для диагностических строк.
     *
     * @param {string} serviceTier
     * @param {boolean} priorityEnabled
     * @returns {string}
     */
    function formatPriorityStatus(serviceTier, priorityEnabled) {
        if (priorityEnabled || serviceTier === 'priority') {
            return '1.5x';
        }

        return serviceTier || 'штатная';
    }

    /**
     * Отображает параметры, раскрытые backend-событиями ответа.
     *
     * @param {{ requestedModelSlug: string, requestedThinkingEffort: string, requestedServiceTier: string, verifyDirectWorkChat?: boolean }} requestInfo
     * @param {{ modelSlug: string, thinkingEffort: string, serviceTier: string }} responseInfo
     */
    function displayBackendInfo(requestInfo, responseInfo) {
        if (responseInfo.modelSlug) {
            state.lastResolvedModelSlug = responseInfo.modelSlug;
        }

        const lines = ['Backend:'];
        let type = 'success';

        if (responseInfo.modelSlug) {
            if (requestInfo.requestedModelSlug && responseInfo.modelSlug !== requestInfo.requestedModelSlug) {
                lines.push(`Model: ${requestInfo.requestedModelSlug} → ${responseInfo.modelSlug}`);
                type = 'warning';
            } else {
                lines.push(`Model: ${responseInfo.modelSlug}`);
            }
        }

        if (responseInfo.thinkingEffort) {
            lines.push(`Thinking: ${responseInfo.thinkingEffort}`);
        }

        if (responseInfo.serviceTier) {
            lines.push(`Priority: ${formatPriorityStatus(responseInfo.serviceTier, false)}`);
        }

        updateBackendStatus(
            lines.length > 1
                ? lines.join('\n')
                : 'Backend:\nHTTP 200\nПараметры потоком не раскрыты',
            type
        );
    }

    /**
     * Читает копию потокового ответа и отображает параметры, раскрытые backend.
     *
     * @param {Response} response
     * @param {{ requestedModelSlug: string, requestedThinkingEffort: string, requestedServiceTier: string }} requestInfo
     */
    async function observeConversationResponse(response, requestInfo) {
        if (!response.ok) {
            updateBackendStatus(`Backend:
HTTP ${response.status}
Model: ${requestInfo.requestedModelSlug || 'штатная'}`, 'error');
            return;
        }

        const responseBody = response.clone().body;

        if (!responseBody) {
            updateBackendStatus(`Backend:
HTTP ${response.status}
Поток данных отсутствует`, 'success');
            return;
        }

        const reader = responseBody.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let responseInfo = {
            modelSlug: '',
            thinkingEffort: '',
            serviceTier: ''
        };

        try {
            while (true) {
                const { value, done } = await reader.read();
                buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

                const lines = buffer.split(/\r?\n/);
                buffer = done ? '' : lines.pop() || '';
                const currentInfo = extractResponseInfo(lines.join('\n'));

                responseInfo = {
                    modelSlug: currentInfo.modelSlug || responseInfo.modelSlug,
                    thinkingEffort: currentInfo.thinkingEffort || responseInfo.thinkingEffort,
                    serviceTier: currentInfo.serviceTier || responseInfo.serviceTier
                };

                if (currentInfo.modelSlug || currentInfo.thinkingEffort || currentInfo.serviceTier) {
                    displayBackendInfo(requestInfo, responseInfo);
                }

                if (done) {
                    break;
                }
            }

            if (buffer) {
                const tailInfo = extractResponseInfo(buffer);
                responseInfo = {
                    modelSlug: tailInfo.modelSlug || responseInfo.modelSlug,
                    thinkingEffort: tailInfo.thinkingEffort || responseInfo.thinkingEffort,
                    serviceTier: tailInfo.serviceTier || responseInfo.serviceTier
                };
            }

            displayBackendInfo(requestInfo, responseInfo);
        } catch (error) {
            if (responseInfo.modelSlug || responseInfo.thinkingEffort || responseInfo.serviceTier) {
                displayBackendInfo(requestInfo, responseInfo);
                log('response stream closed after backend data detection', error);
            } else if (error?.name === 'AbortError' || /aborted/i.test(String(error?.message || ''))) {
                updateBackendStatus('Backend:\nHTTP 200\nПоток закрыт ChatGPT, параметры не раскрыты', 'success');
                log('response stream aborted before backend data detection', error);
            } else {
                updateBackendStatus(`Backend:
Ошибка чтения ответа: ${error.message}`, 'error');
                log('response inspection failed', error);
            }
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Формирует многострочное описание параметров, применённых к исходящему запросу.
     *
     * @param {{ originalModelSlug: string, requestedModelSlug: string, requestedThinkingEffort: string, requestedServiceTier: string, originalConversationOrigin: string, originalConversationMode: string, requestedConversationMode: string }} requestInfo
     * @returns {string}
     */
    function formatRequestStatus(requestInfo) {
        const modelText = state.selectedModelSlug === config.autoModelSlug
            ? `Не изменять модель (${requestInfo.originalModelSlug || 'штатный slug'})`
            : requestInfo.originalModelSlug && requestInfo.originalModelSlug !== requestInfo.requestedModelSlug
                ? `${requestInfo.originalModelSlug} → ${requestInfo.requestedModelSlug}`
                : requestInfo.requestedModelSlug;
        const thinkingText = state.selectedThinkingEffort === 'auto'
            ? `Auto${requestInfo.requestedThinkingEffort ? ` (${requestInfo.requestedThinkingEffort})` : ''}`
            : requestInfo.requestedThinkingEffort || state.selectedThinkingEffort;
        const priorityText = formatPriorityStatus(requestInfo.requestedServiceTier, state.fastModeEnabled);
        const modeText = requestInfo.requestedConversationMode === 'chat'
            ? `Chat Mode${requestInfo.originalConversationOrigin ? `; origin ${requestInfo.originalConversationOrigin} → Chat` : ''}`
            : `Mode: штатный${requestInfo.originalConversationMode ? ` (${requestInfo.originalConversationMode})` : ''}`;

        return [
            'Запрос:',
            `Model: ${modelText || 'штатная'}`,
            `Thinking: ${thinkingText || 'штатное'}`,
            `Priority: ${priorityText}`,
            modeText
        ].join('\n');
    }

    /**
     * Перехватывает запрос создания хода, применяет выбранные параметры и наблюдает ответ.
     *
     * @param {RequestInfo | URL} input
     * @param {RequestInit | undefined} init
     * @returns {Promise<Response>}
     */
    async function fetchWithSelectedModel(input, init) {
        if (state.downstreamCallDepth > 0) {
            return state.baseFetch.call(window, input, init);
        }

        if (state.stopped || getRequestPath(input) !== config.conversationPath) {
            return callDownstreamFetch(input, init);
        }

        const requestBody = await readRequestBody(input, init);
        const requestInfo = requestBody && updateConversationBody(requestBody.body);

        if (!requestBody || !requestInfo) {
            updateRequestStatus('Запрос:\nJSON payload не прочитан', 'error');
            return callDownstreamFetch(input, init);
        }

        const rebuilt = requestInfo.changed
            ? requestBody.rebuild(requestInfo.body)
            : null;

        state.lastRequestedModelSlug = requestInfo.requestedModelSlug;
        state.lastResolvedModelSlug = '';
        updateRequestStatus(formatRequestStatus(requestInfo), 'success');
        updateBackendStatus('Backend:\nОжидание ответа…', 'neutral');
        log('conversation request parameters', requestInfo);

        const response = rebuilt
            ? Array.isArray(rebuilt)
                ? await callDownstreamFetch(rebuilt[0], rebuilt[1])
                : await callDownstreamFetch(rebuilt)
            : await callDownstreamFetch(input, init);

        observeConversationResponse(response, requestInfo);

        return response;
    }

    /**
     * Создает DOM-элемент с атрибутами и текстом.
     *
     * @param {string} tagName
     * @param {Record<string, string>} attributes
     * @param {string} [text]
     * @returns {HTMLElement}
     */
    function createElement(tagName, attributes, text) {
        const element = document.createElement(tagName);

        for (const [name, value] of Object.entries(attributes)) {
            element.setAttribute(name, value);
        }

        if (text !== undefined) {
            element.textContent = text;
        }

        return element;
    }

    /**
     * Записывает текст, визуальный тип строки состояния и скрывает пустую строку.
     *
     * @param {HTMLElement | null} element
     * @param {string} message
     * @param {'neutral' | 'success' | 'warning' | 'error'} type
     */
    function setStatus(element, message, type) {
        if (element) {
            element.textContent = message;
            element.dataset.statusType = type;
            element.hidden = !message;
        }
    }

    /** Возвращает защищённый перехватчик при чтении window.fetch. */
    function getGuardedFetch() {
        return fetchWithSelectedModel;
    }

    /**
     * Принимает новую штатную обёртку fetch как нижний слой перехватчика.
     *
     * @param {Function} value
     */
    function setGuardedFetch(value) {
        if (typeof value === 'function' && value !== fetchWithSelectedModel) {
            state.downstreamFetch = value;
            state.downstreamReplacementCount += 1;
            log('downstream fetch replaced', state.downstreamReplacementCount);
        }

        updateHookStatus();
    }

    /** Устанавливает accessor, сохраняющий перехватчик поверх штатных обёрток. */
    function installFetchGuard() {
        Object.defineProperty(window, 'fetch', {
            configurable: true,
            enumerable: state.originalFetchDescriptor?.enumerable ?? true,
            get: getGuardedFetch,
            set: setGuardedFetch
        });
        state.fetchGuardInstalled = true;
        updateHookStatus();
    }

    /** Отображает состояние защищённого перехватчика window.fetch только при ошибке. */
    function updateHookStatus() {
        const descriptor = Object.getOwnPropertyDescriptor(window, 'fetch');
        const isActive = descriptor?.get === getGuardedFetch && descriptor?.set === setGuardedFetch;

        setStatus(
            state.hookStatus,
            isActive ? '' : 'Перехват fetch:\nзащита неактивна',
            isActive ? 'success' : 'error'
        );
    }

    /**
     * Обновляет строку последнего исходящего запроса.
     *
     * @param {string} message
     * @param {'neutral' | 'success' | 'warning' | 'error'} type
     */
    function updateRequestStatus(message, type) {
        setStatus(state.requestStatus, message, type);
    }

    /**
     * Обновляет строку результата backend.
     *
     * @param {string} message
     * @param {'neutral' | 'success' | 'warning' | 'error'} type
     */
    function updateBackendStatus(message, type) {
        setStatus(state.backendStatus, message, type);
    }

    /** Оставляет выбранные параметры только в полях управления панели. */
    function updateSelectedStatus() {
        setStatus(state.selectedStatus, '', 'success');
    }

    /**
     * Устанавливает модель и сохраняет её идентификатор.
     *
     * Внутреннее значение auto соответствует пункту «Не изменять модель» и отключает замену model slug.
     *
     * @param {string} modelSlug
     * @param {boolean} persist
     */
    function setSelectedModel(modelSlug, persist) {
        const normalizedSlug = String(modelSlug || '').trim() || config.autoModelSlug;

        state.selectedModelSlug = normalizedSlug;

        if (persist) {
            localStorage.setItem(config.storageKey, normalizedSlug);
        }

        if (state.select) {
            state.select.value = normalizedSlug;
        }

        if (state.input && state.input.value !== normalizedSlug) {
            state.input.value = normalizedSlug;
        }

        renderThinkingEfforts();
        updateSelectedStatus();
        restoreHook();
    }

    /**
     * Устанавливает глубину рассуждения и сохраняет её значение.
     *
     * Значение auto сохраняет штатный thinking_effort исходящего запроса.
     *
     * @param {string} thinkingEffort
     * @param {boolean} persist
     */
    function setSelectedThinkingEffort(thinkingEffort, persist) {
        const normalizedEffort = thinkingEffortOptions.some((option) => option.value === thinkingEffort)
            ? thinkingEffort
            : 'auto';

        state.selectedThinkingEffort = normalizedEffort;

        if (persist) {
            localStorage.setItem(config.thinkingEffortStorageKey, normalizedEffort);
        }

        if (state.thinkingSelect) {
            state.thinkingSelect.value = normalizedEffort;
        }

        updateSelectedStatus();
    }

    /**
     * Включает или выключает запрос ускоренного service tier и сохраняет состояние.
     *
     * @param {boolean} enabled
     * @param {boolean} persist
     */
    function setFastModeEnabled(enabled, persist) {
        state.fastModeEnabled = Boolean(enabled);

        if (persist) {
            localStorage.setItem(config.fastModeStorageKey, String(state.fastModeEnabled));
        }

        if (state.fastCheckbox) {
            state.fastCheckbox.checked = state.fastModeEnabled;
        }

        updateSelectedStatus();
    }


    /**
     * Устанавливает режим Chat Mode и сохраняет состояние.
     *
     * Для ручного model slug включённый режим применяет Chat-параметры,
     * а выключенный оставляет параметры режима исходного запроса.
     *
     * @param {boolean} enabled
     * @param {boolean} persist
     */
    function setForceChatEnabled(enabled, persist) {
        state.forceChatEnabled = Boolean(enabled);

        if (persist) {
            localStorage.setItem(config.forceChatStorageKey, String(state.forceChatEnabled));
        }

        if (state.forceChatCheckbox) {
            state.forceChatCheckbox.checked = state.forceChatEnabled;
        }

        updateSelectedStatus();
        restoreHook();
    }

    /**
     * Добавляет модели одной группы в select.
     *
     * @param {HTMLSelectElement} select
     * @param {string} label
     * @param {Array<{ slug?: string, title?: string, badge?: string }>} models
     */
    function appendModelGroup(select, label, models) {
        const group = createElement('optgroup', { label });

        for (const model of models) {
            if (!model.slug) {
                continue;
            }

            const option = createElement('option', { value: model.slug });
            const badge = model.badge ? ` ${model.badge}` : '';
            option.textContent = `${model.title || model.slug} — ${model.slug}${badge}`;
            group.append(option);
        }

        if (group.children.length > 0) {
            select.append(group);
        }
    }

    /** Возвращает загруженные и статически объявленные модели панели. */
    function getAllModelOptions() {
        return [
            ...state.workModels,
            ...state.chatModels,
            ...historicalModels,
            ...experimentalApiModels
        ];
    }

    /** Возвращает описание выбранной модели из загруженных и статически объявленных каталогов. */
    function getSelectedModel() {
        if (state.selectedModelSlug === config.autoModelSlug) {
            return null;
        }

        return getAllModelOptions()
            .find((model) => model.slug === state.selectedModelSlug) || null;
    }

    /**
     * Возвращает объявленные моделью значения thinking_effort.
     *
     * @param {Record<string, any> | null} model
     * @returns {string[] | null}
     */
    function getModelThinkingEfforts(model) {
        if (!model) {
            return null;
        }

        const efforts = Array.isArray(model.thinking_efforts)
            ? model.thinking_efforts
            : Array.isArray(model.thinkingEfforts)
                ? model.thinkingEfforts
                : null;

        if (!efforts) {
            return null;
        }

        return efforts
            .map((effort) => typeof effort === 'string' ? effort : effort?.thinking_effort)
            .filter((effort) => typeof effort === 'string' && effort);
    }

    /**
     * Возвращает описание thinking effort из каталога выбранной модели.
     *
     * @param {Record<string, any> | null} model
     * @param {string} value
     * @returns {Record<string, any> | null}
     */
    function getModelThinkingEffortDetails(model, value) {
        if (!model) {
            return null;
        }

        const efforts = Array.isArray(model.thinking_efforts)
            ? model.thinking_efforts
            : Array.isArray(model.thinkingEfforts)
                ? model.thinkingEfforts
                : [];

        return efforts.find((effort) => {
            return typeof effort === 'object' && effort?.thinking_effort === value;
        }) || null;
    }

    /** Заполняет список глубины рассуждения и отмечает неподдерживаемые значения. */
    function renderThinkingEfforts() {
        if (!state.thinkingSelect) {
            return;
        }

        const selectedModel = getSelectedModel();
        const supportedEfforts = getModelThinkingEfforts(selectedModel);
        state.thinkingSelect.replaceChildren();

        for (const effort of thinkingEffortOptions) {
            const details = getModelThinkingEffortDetails(selectedModel, effort.value);
            const catalogLabel = details?.short_label || details?.full_label || details?.mobile_full_label;
            const optionLabel = catalogLabel ? `${catalogLabel} — ${effort.value}` : effort.label;
            const option = createElement('option', { value: effort.value }, optionLabel);

            if (
                effort.value !== 'auto'
                && supportedEfforts
                && !supportedEfforts.includes(effort.value)
                && effort.value !== state.selectedThinkingEffort
            ) {
                option.disabled = true;
            }

            state.thinkingSelect.append(option);
        }

        state.thinkingSelect.value = state.selectedThinkingEffort;
    }

    /** Заполняет список режимом «Не изменять модель», каталогами ChatGPT, историческими моделями, API-моделями и ручным slug. */
    function renderModels() {
        if (!state.select) {
            return;
        }

        state.select.replaceChildren();
        state.select.append(createElement('option', { value: config.autoModelSlug }, 'Не изменять модель'));
        appendModelGroup(state.select, 'Модели Work / TPP', state.workModels);
        appendModelGroup(state.select, 'Обычный ChatGPT', state.chatModels);
        appendModelGroup(state.select, 'Исторические модели', historicalModels);
        appendModelGroup(state.select, 'Экспериментальные модели OpenAI API', experimentalApiModels);

        const allModels = getAllModelOptions();

        if (
            state.selectedModelSlug
            && state.selectedModelSlug !== config.autoModelSlug
            && !allModels.some((model) => model.slug === state.selectedModelSlug)
        ) {
            const group = createElement('optgroup', { label: 'Ручной slug' });
            group.append(createElement('option', { value: state.selectedModelSlug }, `${state.selectedModelSlug} — вручную`));
            state.select.append(group);
        }

        state.select.value = state.selectedModelSlug;
        renderThinkingEfforts();
    }

    /**
     * Возвращает bearer-токен текущей сессии ChatGPT.
     *
     * Значение используется только в памяти для запроса TPP-каталога и не
     * записывается в DOM, console или localStorage.
     *
     * @returns {Promise<string>}
     */
    async function loadSessionAccessToken() {
        const response = await state.baseFetch.call(window, '/api/auth/session', {
            credentials: 'include',
            headers: {
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`/api/auth/session: HTTP ${response.status}`);
        }

        const session = await response.json();
        const accessToken = session?.accessToken;

        if (typeof accessToken !== 'string' || !accessToken) {
            throw new Error('/api/auth/session: accessToken отсутствует');
        }

        return accessToken;
    }

    /**
     * Загружает и возвращает JSON backend-метода.
     *
     * @param {string} url
     * @returns {Promise<Record<string, any>>}
     */
    async function loadJson(url) {
        let response = await state.baseFetch.call(window, url, {
            credentials: 'include'
        });

        if (url === config.workModelsUrl && response.status === 404) {
            const accessToken = await loadSessionAccessToken();

            response = await state.baseFetch.call(window, url, {
                credentials: 'include',
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${accessToken}`
                }
            });
        }

        if (!response.ok) {
            throw new Error(`${url}: HTTP ${response.status}`);
        }

        return response.json();
    }

    /**
     * Загружает отдельные каталоги Work и обычного ChatGPT.
     *
     * После ошибки автоматически повторяет загрузку ограниченное число раз.
     *
     * @param {number} [attempt]
     */
    async function loadModels(attempt = 0) {
        setStatus(state.catalogStatus, '', 'neutral');

        const [workResult, chatResult] = await Promise.allSettled([
            loadJson(config.workModelsUrl),
            loadJson(config.chatModelsUrl)
        ]);
        const errors = [];

        if (workResult.status === 'fulfilled') {
            state.workModels = Array.isArray(workResult.value.models) ? workResult.value.models : [];
            state.workDefaultModelSlug = String(workResult.value.default_model_slug || '');
        } else {
            state.workModels = [];
            errors.push(workResult.reason.message);
        }

        if (chatResult.status === 'fulfilled') {
            state.chatModels = Array.isArray(chatResult.value.models) ? chatResult.value.models : [];
        } else {
            state.chatModels = [];
            errors.push(chatResult.reason.message);
        }

        if (!state.selectedModelSlug) {
            setSelectedModel(
                localStorage.getItem(config.storageKey) || config.autoModelSlug,
                false
            );
        }

        renderModels();

        if (errors.length > 0) {
            if (attempt < config.catalogRetryCount) {
                setStatus(
                    state.catalogStatus,
                    `Каталоги:
повтор ${attempt + 1}/${config.catalogRetryCount}…`,
                    'warning'
                );
                window.setTimeout(() => loadModels(attempt + 1), config.catalogRetryDelayMs);
            } else {
                setStatus(state.catalogStatus, `Каталоги:
${errors.join('\n')}`, 'error');
            }
        } else {
            setStatus(state.catalogStatus, '', 'success');
        }

        log('model catalogs loaded', {
            workModels: state.workModels,
            chatModels: state.chatModels,
            workDefaultModelSlug: state.workDefaultModelSlug,
            attempt
        });
    }

    /** Возвращает защитный accessor после его удаления сторонним JavaScript. */
    function restoreHook() {
        const descriptor = Object.getOwnPropertyDescriptor(window, 'fetch');

        if (descriptor?.get !== getGuardedFetch || descriptor?.set !== setGuardedFetch) {
            const currentFetch = window.fetch;

            if (typeof currentFetch === 'function' && currentFetch !== fetchWithSelectedModel) {
                state.downstreamFetch = currentFetch;
            }

            installFetchGuard();
        }

        updateHookStatus();
    }

    /**
     * Ограничивает координаты панели видимой областью окна.
     *
     * @param {number} left
     * @param {number} top
     * @returns {{ left: number, top: number }}
     */
    function clampPanelPosition(left, top) {
        const rect = state.panel.getBoundingClientRect();
        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - rect.height);

        return {
            left: Math.min(Math.max(0, left), maxLeft),
            top: Math.min(Math.max(0, top), maxTop)
        };
    }

    /**
     * Устанавливает фиксированную позицию панели.
     *
     * @param {number} left
     * @param {number} top
     */
    function setPanelPosition(left, top) {
        const position = clampPanelPosition(left, top);

        state.panel.style.left = `${position.left}px`;
        state.panel.style.top = `${position.top}px`;
        state.panel.style.right = 'auto';
        state.panel.style.bottom = 'auto';
    }

    /** Сохраняет текущую позицию панели в localStorage. */
    function savePanelPosition() {
        const rect = state.panel.getBoundingClientRect();

        localStorage.setItem(config.positionStorageKey, JSON.stringify({
            left: rect.left,
            top: rect.top
        }));
    }

    /** Восстанавливает сохранённую позицию панели. */
    function restorePanelPosition() {
        const storedPosition = localStorage.getItem(config.positionStorageKey);

        if (!storedPosition) {
            return;
        }

        try {
            const position = JSON.parse(storedPosition);

            if (Number.isFinite(position?.left) && Number.isFinite(position?.top)) {
                setPanelPosition(position.left, position.top);
            }
        } catch (error) {
            log('stored panel position is invalid', error);
        }
    }

    /** Сохраняет пользовательский размер развёрнутой панели. */
    function savePanelSize() {
        if (!state.panel || state.collapsed) {
            return;
        }

        const rect = state.panel.getBoundingClientRect();

        localStorage.setItem(config.sizeStorageKey, JSON.stringify({
            width: rect.width,
            height: rect.height
        }));
    }

    /** Восстанавливает сохранённый размер панели с учётом текущего viewport. */
    function restorePanelSize() {
        const storedSize = localStorage.getItem(config.sizeStorageKey);

        if (!storedSize) {
            return;
        }

        try {
            const size = JSON.parse(storedSize);

            if (Number.isFinite(size?.width) && Number.isFinite(size?.height)) {
                const maxWidth = Math.max(260, window.innerWidth - 16);
                const maxHeight = Math.max(220, window.innerHeight - 16);
                const width = Math.min(Math.max(260, size.width), maxWidth);
                const height = Math.min(Math.max(220, size.height), maxHeight);

                state.panel.style.width = `${width}px`;
                state.panel.style.height = `${height}px`;
            }
        } catch (error) {
            log('stored panel size is invalid', error);
        }
    }

    /** Сохраняет размер после ручного изменения панели и удерживает её в viewport. */
    function handlePanelResize() {
        if (!state.panel || state.collapsed) {
            return;
        }

        const rect = state.panel.getBoundingClientRect();
        setPanelPosition(rect.left, rect.top);
        savePanelSize();
    }

    /**
     * Сворачивает или разворачивает панель и сохраняет состояние.
     *
     * @param {boolean} collapsed
     * @param {boolean} persist
     */
    function setPanelCollapsed(collapsed, persist) {
        state.collapsed = collapsed;
        state.panel.classList.toggle('is-collapsed', collapsed);
        state.collapseButton.textContent = collapsed ? '+' : '\u2212';
        state.collapseButton.setAttribute('aria-label', collapsed ? '\u0420\u0430\u0437\u0432\u0435\u0440\u043d\u0443\u0442\u044c \u043f\u0430\u043d\u0435\u043b\u044c' : '\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c \u043f\u0430\u043d\u0435\u043b\u044c');
        state.collapseButton.setAttribute('aria-expanded', String(!collapsed));

        if (persist) {
            localStorage.setItem(config.collapsedStorageKey, String(collapsed));
        }

        const rect = state.panel.getBoundingClientRect();
        setPanelPosition(rect.left, rect.top);
    }

    /** Начинает перемещение панели за шапку. */
    function handleHeaderPointerDown(event) {
        if (event.button !== 0 || event.target.closest('button')) {
            return;
        }

        const rect = state.panel.getBoundingClientRect();

        state.dragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: rect.left,
            startTop: rect.top
        };
        state.header.classList.add('is-dragging');
        state.header.setPointerCapture(event.pointerId);
        event.preventDefault();
    }

    /** Перемещает панель вслед за активным указателем. */
    function handleHeaderPointerMove(event) {
        if (!state.dragState || state.dragState.pointerId !== event.pointerId) {
            return;
        }

        setPanelPosition(
            state.dragState.startLeft + event.clientX - state.dragState.startX,
            state.dragState.startTop + event.clientY - state.dragState.startY
        );
    }

    /** Завершает перемещение панели и сохраняет позицию. */
    function handleHeaderPointerUp(event) {
        if (!state.dragState || state.dragState.pointerId !== event.pointerId) {
            return;
        }

        state.header.classList.remove('is-dragging');

        if (state.header.hasPointerCapture(event.pointerId)) {
            state.header.releasePointerCapture(event.pointerId);
        }

        state.dragState = null;
        savePanelPosition();
    }

    /** Возвращает панель в видимую область после изменения размера окна. */
    function handleWindowResize() {
        if (!state.panel) {
            return;
        }

        const rect = state.panel.getBoundingClientRect();
        setPanelPosition(rect.left, rect.top);
        savePanelPosition();
    }

    /** Применяет ручной slug после каждого изменения поля ввода. */
    function handleManualModelInput() {
        setSelectedModel(state.input.value, true);
        renderModels();
    }

    /**
     * Добавляет компактную изменяемую по размеру панель управления и диагностики.
     *
     * Шапка содержит иконку, название и версию и служит областью перемещения.
     * Поля модели, ручного slug, thinking effort и оба переключателя имеют уникальные
     * идентификаторы и имена. Переключатели связаны с подписями через for.
     * Размер и положение панели сохраняются между перезагрузками страницы.
     */
    function createPanel() {
        const panel = createElement('section', {
            id: 'gpt-model-picker-panel',
            role: 'dialog',
            'aria-label': 'Выбор и контроль модели ChatGPT'
        });
        const header = createElement('div', { class: 'gpt-model-picker-header' });
        const identity = createElement('div', { class: 'gpt-model-picker-identity' });
        const icon = createElement('div', { class: 'gpt-model-picker-app-icon', 'aria-hidden': 'true' });
        const titleCopy = createElement('div', { class: 'gpt-model-picker-title-copy' });
        const title = createElement('div', { class: 'gpt-model-picker-title' }, 'GPT Model Picker');
        const version = createElement('div', { class: 'gpt-model-picker-version' }, `ChatGPT · v${config.version}`);
        const collapseButton = createElement('button', {
            class: 'gpt-model-picker-collapse',
            type: 'button',
            'aria-label': 'Свернуть панель',
            'aria-expanded': 'true'
        }, '−');
        const content = createElement('div', { class: 'gpt-model-picker-content' });
        const modelLabel = createElement('label', { class: 'gpt-model-picker-field', for: 'gpt-model-picker-model' });
        const modelLabelText = createElement('span', { class: 'gpt-model-picker-field-label' }, 'Модель');
        const select = createElement('select', {
            id: 'gpt-model-picker-model',
            name: 'gpt-model-picker-model',
            class: 'gpt-model-picker-select',
            'aria-label': 'Модель ChatGPT'
        });
        const inputLabel = createElement('label', { class: 'gpt-model-picker-field', for: 'gpt-model-picker-manual-model' });
        const inputLabelText = createElement('span', { class: 'gpt-model-picker-field-label' }, 'Ручной slug');
        const input = createElement('input', {
            id: 'gpt-model-picker-manual-model',
            name: 'gpt-model-picker-manual-model',
            class: 'gpt-model-picker-input',
            type: 'text',
            placeholder: 'model_slug вручную',
            'aria-label': 'Идентификатор модели вручную'
        });
        const thinkingLabel = createElement('label', { class: 'gpt-model-picker-field', for: 'gpt-model-picker-thinking-effort' });
        const thinkingLabelText = createElement('span', { class: 'gpt-model-picker-field-label' }, 'Как сильно думать');
        const thinkingSelect = createElement('select', {
            id: 'gpt-model-picker-thinking-effort',
            name: 'gpt-model-picker-thinking-effort',
            class: 'gpt-model-picker-select',
            'aria-label': 'Глубина рассуждения'
        });
        const toggles = createElement('div', { class: 'gpt-model-picker-toggles' });
        const fastLabel = createElement('label', {
            class: 'gpt-model-picker-toggle',
            for: 'gpt-model-picker-fast-checkbox'
        });
        const fastCheckbox = createElement('input', {
            id: 'gpt-model-picker-fast-checkbox',
            name: 'gpt-model-picker-fast-checkbox',
            class: 'gpt-model-picker-checkbox',
            type: 'checkbox',
            'aria-label': 'Скорость 1.5x'
        });
        const fastText = createElement('span', {}, 'Скорость 1.5x');
        const forceChatLabel = createElement('label', {
            class: 'gpt-model-picker-toggle',
            for: 'gpt-model-picker-force-chat-checkbox'
        });
        const forceChatCheckbox = createElement('input', {
            id: 'gpt-model-picker-force-chat-checkbox',
            name: 'gpt-model-picker-force-chat-checkbox',
            class: 'gpt-model-picker-checkbox',
            type: 'checkbox',
            'aria-label': 'Chat Mode'
        });
        const forceChatText = createElement('span', {}, 'Chat Mode');
        const diagnostics = createElement('div', { class: 'gpt-model-picker-diagnostics' });
        const hookStatus = createElement('div', { class: 'gpt-model-picker-status', role: 'status', hidden: '' });
        const catalogStatus = createElement('div', { class: 'gpt-model-picker-status', role: 'status', hidden: '' });
        const selectedStatus = createElement('div', { class: 'gpt-model-picker-status', role: 'status', hidden: '' });
        const requestStatus = createElement('div', { class: 'gpt-model-picker-status', role: 'status' }, 'Запрос:\nещё не отправлялся');
        const backendStatus = createElement('div', { class: 'gpt-model-picker-status', role: 'status' }, 'Backend:\nещё не проверен');
        const hint = createElement('div', { class: 'gpt-model-picker-hint' }, 'Chat Mode удерживает ручной model slug в обычном primary_assistant Chat. Выключите его, если нужен штатный режим выбранной модели.');

        icon.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="#69afed"/><path d="M9 11.5h14M9 16h9M9 20.5h12" fill="none" stroke="#0f1720" stroke-width="2.2" stroke-linecap="round"/><circle cx="23" cy="20.5" r="2.2" fill="#f2f5f8"/></svg>';
        titleCopy.append(title, version);
        identity.append(icon, titleCopy);
        header.append(identity, collapseButton);
        modelLabel.append(modelLabelText, select);
        inputLabel.append(inputLabelText, input);
        thinkingLabel.append(thinkingLabelText, thinkingSelect);
        fastLabel.append(fastCheckbox, fastText);
        forceChatLabel.append(forceChatCheckbox, forceChatText);
        toggles.append(fastLabel, forceChatLabel);
        diagnostics.append(hookStatus, catalogStatus, requestStatus, backendStatus);
        content.append(modelLabel, inputLabel, thinkingLabel, toggles, diagnostics, hint);
        panel.append(header, content);
        document.body.append(panel);

        Object.assign(state, {
            panel,
            header,
            collapseButton,
            select,
            input,
            thinkingSelect,
            fastCheckbox,
            forceChatCheckbox,
            hookStatus,
            catalogStatus,
            selectedStatus,
            requestStatus,
            backendStatus
        });

        select.addEventListener('change', () => {
            setSelectedModel(select.value, true);
            renderModels();
        });
        input.addEventListener('input', handleManualModelInput);
        thinkingSelect.addEventListener('change', () => setSelectedThinkingEffort(thinkingSelect.value, true));
        fastCheckbox.addEventListener('change', () => setFastModeEnabled(fastCheckbox.checked, true));
        forceChatCheckbox.addEventListener('change', () => setForceChatEnabled(forceChatCheckbox.checked, true));
        collapseButton.addEventListener('click', () => setPanelCollapsed(!state.collapsed, true));
        header.addEventListener('pointerdown', handleHeaderPointerDown);
        header.addEventListener('pointermove', handleHeaderPointerMove);
        header.addEventListener('pointerup', handleHeaderPointerUp);
        header.addEventListener('pointercancel', handleHeaderPointerUp);
        window.addEventListener('resize', handleWindowResize);

        state.selectedThinkingEffort = localStorage.getItem(config.thinkingEffortStorageKey) || 'auto';
        state.fastModeEnabled = localStorage.getItem(config.fastModeStorageKey) === 'true';
        state.forceChatEnabled = localStorage.getItem(config.forceChatStorageKey) !== 'false';
        setSelectedThinkingEffort(state.selectedThinkingEffort, false);
        setFastModeEnabled(state.fastModeEnabled, false);
        setForceChatEnabled(state.forceChatEnabled, false);

        restorePanelSize();
        setPanelCollapsed(localStorage.getItem(config.collapsedStorageKey) === 'true', false);
        restorePanelPosition();

        if (typeof ResizeObserver === 'function') {
            state.resizeObserver = new ResizeObserver(handlePanelResize);
            state.resizeObserver.observe(panel);
        }
    }
    /**
     * Возвращает URL разговора из DOM-атрибутов или данных React-компонента строки.
     *
     * Ключ боковой панели покрывает обычные чаты. Проектные строки используют
     * props ближайших React-компонентов и точное совпадение заголовка строки.
     *
     * @param {HTMLElement} container Строка разговора или её контейнер.
     * @returns {string}
     */
    function getNavigationHref(container) {
        const listItem = container.closest('[data-sidebar-chatgpt-conversation-key]')
            || container.querySelector('[data-sidebar-chatgpt-conversation-key]');
        const conversationKey = listItem?.getAttribute('data-sidebar-chatgpt-conversation-key') || '';
        const conversationPrefix = 'chatgpt:conversation:';

        if (conversationKey.startsWith(conversationPrefix)) {
            const conversationId = conversationKey.slice(conversationPrefix.length);

            if (conversationId) {
                return `/c/${encodeURIComponent(conversationId)}`;
            }
        }

        const directId = container.getAttribute('data-conversation-id')
            || container.getAttribute('data-chat-id')
            || container.dataset.conversationId
            || '';
        if (directId) {
            return `/c/${encodeURIComponent(directId)}`;
        }

        const row = container.matches('[role="button"]')
            ? container
            : container.querySelector('[role="button"]');
        const title = (row?.innerText || container.innerText || '').trim();
        if (!row || !title) {
            return '';
        }

        const visited = new WeakSet();
        const idKeys = new Set(['id', 'conversationId', 'conversation_id']);
        const titleKeys = new Set(['title', 'name']);
        const readMatchingId = (value, depth = 0) => {
            if (!value || typeof value !== 'object' || depth > 6 || visited.has(value)) {
                return '';
            }
            visited.add(value);

            if (!Array.isArray(value)) {
                const keys = Object.keys(value);
                const itemTitle = keys.find(key => titleKeys.has(key) && typeof value[key] === 'string');
                const itemId = keys.find(key => idKeys.has(key) && typeof value[key] === 'string');

                if (itemTitle && itemId && value[itemTitle].trim() === title) {
                    return value[itemId];
                }
            }

            for (const key of Object.keys(value)) {
                const found = readMatchingId(value[key], depth + 1);
                if (found) {
                    return found;
                }
            }
            return '';
        };

        let fiber = null;
        for (let element = row; element && !fiber; element = element.parentElement) {
            const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$'));
            if (fiberKey) {
                fiber = element[fiberKey];
            }
        }

        for (let level = 0; fiber && level < 12; level += 1, fiber = fiber.return) {
            const props = fiber.memoizedProps || fiber.pendingProps;
            const conversationId = readMatchingId(props);

            if (conversationId) {
                return `/c/${encodeURIComponent(conversationId)}`;
            }
        }

        return '';
    }

    /**
     * Создаёт прозрачную ссылку поверх элемента боковой панели.
     *
     * Ссылка сохраняет штатное меню браузера по правому клику и передаёт обычный
     * левый клик исходному элементу ChatGPT.
     *
     * @param {HTMLElement} container Элемент боковой панели.
     * @param {string} href Адрес разговора или страницы нового чата.
     * @param {string} type Тип ссылки для синхронизации и очистки.
     * @param {HTMLElement} parent Элемент, в котором размещается ссылка.
     * @returns {void}
     */
    function ensureNavigationLink(container, href, type, parent = container) {
        let link = Array.from(parent.children).find(
            child => child instanceof HTMLAnchorElement
                && child.dataset.gptModelPickerNavigationLink === type
        );

        if (!link) {
            link = document.createElement('a');
            link.dataset.gptModelPickerNavigationLink = type;
            link.href = href;
            link.tabIndex = -1;
            link.setAttribute('aria-hidden', 'true');
            link.style.position = 'absolute';
            link.style.zIndex = '1';
            link.style.display = 'block';
            link.style.borderRadius = 'inherit';
            link.style.textDecoration = 'none';

            link.addEventListener('click', event => {
                if (
                    event.button !== 0
                    || event.metaKey
                    || event.ctrlKey
                    || event.shiftKey
                    || event.altKey
                ) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                container.click();
            });

            if (getComputedStyle(parent).position === 'static') {
                parent.dataset.gptModelPickerOriginalPosition = parent.style.position;
                parent.style.position = 'relative';
            }

            if (parent === container) {
                link.style.inset = '0';
            } else {
                link.style.left = `${container.offsetLeft}px`;
                link.style.top = `${container.offsetTop}px`;
                link.style.width = `${container.offsetWidth}px`;
                link.style.height = `${container.offsetHeight}px`;
            }

            parent.append(link);
        } else {
            link.href = href;
        }

        if (parent === container) {
            link.style.inset = '0';
            link.style.left = '';
            link.style.top = '';
            link.style.width = '';
            link.style.height = '';
        } else {
            link.style.inset = '';
            link.style.left = `${container.offsetLeft}px`;
            link.style.top = `${container.offsetTop}px`;
            link.style.width = `${container.offsetWidth}px`;
            link.style.height = `${container.offsetHeight}px`;
        }
    }

    /**
     * Синхронизирует состояние строк разговоров боковой панели.
     *
     * Меню открываются штатными триггерами ChatGPT. Пункт новой вкладки
     * добавляется наблюдателем после создания меню.
     *
     * @param {ParentNode} root Корень боковой панели.
     * @returns {void}
     */
    function syncNavigationLinks(root = document) {
        root.querySelectorAll('button[aria-label="Действия чата"]').forEach(trigger => {
            const row = getChatActionRow(trigger);

            if (row) {
                row.dataset.gptModelPickerChatRow = 'true';
            }
        });
    }

    /**
     * Добавляет «Открыть в новой вкладке» первым пунктом штатного меню чата.
     *
     * Пункт создаётся для каждой появившейся панели меню. Адрес разговора
     * вычисляется при нажатии по данным строки, связанной с этим меню.
     *
     * @param {HTMLElement} menu Открытое меню ChatGPT.
     * @param {HTMLElement} row Строка выбранного разговора.
     * @returns {void}
     */
    function prependOpenConversationItem(menu, row) {
        const template = menu.querySelector('[role="menuitem"]');
        if (!template) {
            return;
        }

        let item = menu.querySelector('[data-gpt-model-picker-open-in-tab]');
        if (!item) {
            item = template.cloneNode(false);
            item.dataset.gptModelPickerOpenInTab = 'true';
            item.removeAttribute('id');
            item.setAttribute('role', 'menuitem');
            item.setAttribute('tabindex', '-1');
            item.textContent = 'Открыть в новой вкладке';
        }

        item.onclick = event => {
            event.preventDefault();
            event.stopPropagation();

            const href = getNavigationHref(row);
            if (!href) {
                log('Не найден адрес разговора для новой вкладки', row);
                return;
            }

            window.open(href, '_blank', 'noopener,noreferrer');
            menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        };

        if (item !== menu.firstChild) {
            menu.insertBefore(item, menu.firstChild);
        }
    }

    /**
     * Возвращает строку чата, которой принадлежит кнопка штатного меню.
     *
     * @param {HTMLButtonElement} trigger Кнопка «Действия чата».
     * @returns {HTMLElement | null}
     */
    function getChatActionRow(trigger) {
        const directRow = trigger.closest('[role="button"]');
        if (directRow instanceof HTMLElement) {
            return directRow;
        }

        const container = trigger.closest(
            '[role="listitem"], [data-sidebar-chatgpt-conversation-key], .group.relative.cursor-interaction'
        );
        if (!container) {
            return null;
        }

        const row = container.matches('[role="button"]')
            ? container
            : container.querySelector('[role="button"]');

        return row instanceof HTMLElement ? row : null;
    }

    /**
     * Возвращает кнопку действий, расположенную в строке чата.
     *
     * @param {Element | null} target Элемент, по которому выполнен правый клик.
     * @returns {HTMLButtonElement | null}
     */
    function getChatActionTrigger(target) {
        if (!(target instanceof Element)) {
            return null;
        }

        const directTrigger = target.closest('button[aria-label="Действия чата"]');
        if (directTrigger instanceof HTMLButtonElement) {
            return directTrigger;
        }

        const row = target.closest('[role="button"]');
        const rowTrigger = row?.querySelector('button[aria-label="Действия чата"]');
        if (rowTrigger instanceof HTMLButtonElement) {
            return rowTrigger;
        }

        const container = target.closest(
            '[role="listitem"], [data-sidebar-chatgpt-conversation-key], .group.relative.cursor-interaction'
        );
        const containerTrigger = container?.querySelector('button[aria-label="Действия чата"]');

        return containerTrigger instanceof HTMLButtonElement ? containerTrigger : null;
    }

    /**
     * Возвращает кнопку действий чата, связанную с открытым меню.
     *
     * Связь определяется по ARIA-атрибутам Radix: идентификатор триггера
     * передаётся в aria-labelledby меню, а идентификатор меню — в
     * aria-controls или aria-owns кнопки.
     *
     * @param {HTMLElement} menu Открытое меню ChatGPT.
     * @returns {HTMLButtonElement | null}
     */
    function getMenuChatActionTrigger(menu) {
        const labelIds = (menu.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);

        for (const id of labelIds) {
            const trigger = document.getElementById(id);

            if (trigger instanceof HTMLButtonElement && trigger.getAttribute('aria-label') === 'Действия чата') {
                return trigger;
            }
        }

        const menuId = menu.id;
        if (!menuId) {
            return null;
        }

        const triggers = Array.from(document.querySelectorAll('button[aria-label="Действия чата"]'));
        const controlledTrigger = triggers.find(trigger => {
            const controlledIds = [
                trigger.getAttribute('aria-controls'),
                trigger.getAttribute('aria-owns')
            ].filter(Boolean).flatMap(value => value.split(/\s+/));

            return controlledIds.includes(menuId);
        });
        if (controlledTrigger instanceof HTMLButtonElement) {
            return controlledTrigger;
        }

        const expandedTriggers = triggers.filter(trigger => trigger.getAttribute('aria-expanded') === 'true');

        return expandedTriggers.length === 1 ? expandedTriggers[0] : null;
    }

    /**
     * Возвращает открытые и видимые штатные меню ChatGPT.
     *
     * @returns {HTMLElement[]}
     */
    function getOpenChatMenus() {
        return Array.from(document.querySelectorAll('[role="menu"]')).filter(menu => {
            if (!(menu instanceof HTMLElement) || menu.dataset.gptModelPickerNewChatMenu) {
                return false;
            }

            const style = getComputedStyle(menu);
            return menu.getClientRects().length > 0
                && style.display !== 'none'
                && style.visibility !== 'hidden';
        });
    }

    /**
     * Синхронизирует первый пункт всех открытых штатных меню чатов.
     *
     * @returns {void}
     */
    function syncOpenNavigationMenus() {
        getOpenChatMenus().forEach(menu => {
            const trigger = getMenuChatActionTrigger(menu);
            const row = trigger ? getChatActionRow(trigger) : null;

            if (row) {
                prependOpenConversationItem(menu, row);
            }
        });
    }

    /**
     * Проверяет, является ли кнопка основной кнопкой создания нового чата.
     *
     * @param {Element | null} target Целевой элемент события.
     * @returns {HTMLButtonElement | null}
     */
    function getNewChatButton(target) {
        const button = target?.closest('button');

        if (!(button instanceof HTMLButtonElement)) {
            return null;
        }

        return button.getAttribute('aria-label') === 'Новый чат'
            || button.innerText.trim() === 'Новый чат'
            ? button
            : null;
    }

    /**
     * Возвращает шаблон штатного меню ChatGPT для меню нового чата.
     *
     * @returns {{ menu: HTMLElement, item: HTMLElement } | null}
     */
    function getChatMenuTemplate() {
        const item = document.querySelector('[role="menu"] [role="menuitem"]');
        const menu = item?.closest('[role="menu"]');

        return item instanceof HTMLElement && menu instanceof HTMLElement
            ? { menu, item }
            : null;
    }

    /**
     * Создаёт однопунктовое меню нового чата из структуры штатного меню ChatGPT.
     *
     * @param {MouseEvent} event Событие правого клика.
     * @returns {void}
     */
    function openNewChatContextMenu(event) {
        document.querySelector('[data-gpt-model-picker-new-chat-menu]')?.remove();

        const template = getChatMenuTemplate();
        const menu = template?.menu.cloneNode(false) || document.createElement('div');
        menu.dataset.gptModelPickerNewChatMenu = 'true';
        menu.removeAttribute('id');
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Меню нового чата');
        menu.style.position = 'fixed';
        menu.style.left = `${Math.min(event.clientX, window.innerWidth - 235)}px`;
        menu.style.top = `${Math.min(event.clientY, window.innerHeight - 56)}px`;
        menu.style.zIndex = '2147483647';
        menu.style.display = 'flex';
        menu.style.minWidth = '220px';
        menu.style.padding = '4px';
        menu.style.flexDirection = 'column';
        menu.style.color = 'var(--app-color-foreground-application-menu, #f9f9f9)';
        menu.style.background = 'var(--app-color-background-application-menu, #212121)';
        menu.style.border = '1px solid var(--app-color-border, #444)';
        menu.style.borderRadius = '12px';
        menu.style.boxShadow = '0 8px 24px rgb(0 0 0 / 28%)';

        const item = template?.item.cloneNode(false) || document.createElement('div');
        item.removeAttribute('id');
        item.setAttribute('role', 'menuitem');
        item.setAttribute('tabindex', '0');
        item.textContent = 'Открыть в новой вкладке';
        item.style.display = 'flex';
        item.style.minHeight = '36px';
        item.style.alignItems = 'center';
        item.style.padding = '0 12px';
        item.style.borderRadius = '8px';
        item.style.cursor = 'pointer';
        item.onclick = () => {
            window.open('/', '_blank', 'noopener,noreferrer');
            closeMenu();
        };
        menu.append(item);
        document.body.append(menu);
        item.focus();

        const closeMenu = closeEvent => {
            if (closeEvent?.type === 'keydown' && closeEvent.key !== 'Escape') {
                return;
            }
            if (closeEvent?.type === 'click' && menu.contains(closeEvent.target)) {
                return;
            }

            menu.remove();
            document.removeEventListener('click', closeMenu, true);
            document.removeEventListener('keydown', closeMenu, true);
        };
        document.addEventListener('click', closeMenu, true);
        document.addEventListener('keydown', closeMenu, true);
    }

    /**
     * Открывает меню нового чата или штатное меню действий чата по правому клику.
     *
     * @param {MouseEvent} event Событие контекстного меню.
     * @returns {void}
     */
    function handleNavigationContextMenu(event) {
        const target = event.target instanceof Element ? event.target : null;
        const newChatButton = getNewChatButton(target);

        if (newChatButton) {
            event.preventDefault();
            event.stopImmediatePropagation();
            openNewChatContextMenu(event);
            return;
        }

        const chatActionTrigger = getChatActionTrigger(target);
        if (!chatActionTrigger) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        chatActionTrigger.click();
    }

    /**
     * Наблюдает за созданием и изменением штатных меню ChatGPT.
     *
     * @returns {void}
     */
    function observeNavigationLinks() {
        const sidebar = document.querySelector('[data-app-action-sidebar-scroll]')?.closest('nav') || document.body;

        if (state.navigationLinkObserver) {
            state.navigationLinkObserver.disconnect();
        }
        if (state.navigationMenuObserver) {
            state.navigationMenuObserver.disconnect();
        }
        if (state.navigationContextMenuHandler) {
            document.removeEventListener('contextmenu', state.navigationContextMenuHandler, true);
        }

        state.navigationContextMenuHandler = handleNavigationContextMenu;
        document.addEventListener('contextmenu', state.navigationContextMenuHandler, true);

        state.navigationLinkObserver = new MutationObserver(() => syncNavigationLinks(sidebar));
        state.navigationLinkObserver.observe(sidebar, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                'aria-label',
                'data-sidebar-chatgpt-conversation-key',
                'data-conversation-id',
                'data-chat-id'
            ],
            characterData: true
        });
        syncNavigationLinks(sidebar);

        state.navigationMenuObserver = new MutationObserver(syncOpenNavigationMenus);
        state.navigationMenuObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                'aria-controls',
                'aria-expanded',
                'aria-labelledby',
                'aria-owns',
                'data-state',
                'style'
            ]
        });
        syncOpenNavigationMenus();
    }

    /**
     * Удаляет собственное меню нового чата и обработчики боковой панели.
     *
     * @returns {void}
     */
    function removeNavigationLinks() {
        document.querySelectorAll('a[data-gpt-model-picker-navigation-link]').forEach(link => link.remove());
        document.querySelectorAll('[data-gpt-model-picker-new-chat-menu]').forEach(menu => menu.remove());
        document.querySelectorAll('[data-gpt-model-picker-chat-row]').forEach(row => {
            delete row.dataset.gptModelPickerChatRow;
        });

        if (state.navigationContextMenuHandler) {
            document.removeEventListener('contextmenu', state.navigationContextMenuHandler, true);
            state.navigationContextMenuHandler = null;
        }
    }

    /**
     * Добавляет компактный оконный стиль панели с изменяемым размером.
     *
     * Палитра и структура шапки повторяют подход DropMe: отдельная title bar,
     * иконка приложения, название, вторичная строка версии и плоская кнопка справа.
     * Стили панели имеют повышенную специфичность, а checkbox сохраняет нативный вид.
     */
    function addStyles() {
        const style = document.createElement('style');

        style.id = 'gpt-model-picker-styles';
        style.textContent = `
            #gpt-model-picker-panel {
                position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
                display: flex; width: min(330px, calc(100vw - 16px)); height: min(430px, calc(100vh - 16px));
                min-width: 260px; min-height: 220px; max-width: calc(100vw - 8px); max-height: calc(100vh - 8px);
                box-sizing: border-box; flex-direction: column; overflow: hidden; resize: both;
                color: #f2f5f8; background: #111418; border: 1px solid #34404b; border-radius: 10px;
                box-shadow: 0 10px 32px rgb(0 0 0 / 38%); font: 11px/1.3 Arial, sans-serif;
            }
            #gpt-model-picker-panel.is-collapsed {
                height: 44px !important; min-height: 0; max-height: 44px; resize: none;
            }
            #gpt-model-picker-panel.is-collapsed .gpt-model-picker-content { display: none; }
            .gpt-model-picker-header {
                display: flex; min-height: 44px; flex: 0 0 44px; align-items: center; justify-content: space-between;
                gap: 8px; box-sizing: border-box; padding: 6px 7px 6px 8px; touch-action: none; user-select: none;
                background: #252d36; border-bottom: 1px solid #34404b; cursor: grab;
            }
            #gpt-model-picker-panel.is-collapsed .gpt-model-picker-header { border-bottom: 0; }
            .gpt-model-picker-header.is-dragging { cursor: grabbing; }
            .gpt-model-picker-identity {
                display: flex; min-width: 0; flex: 1 1 auto; align-items: center; gap: 8px; pointer-events: none;
            }
            .gpt-model-picker-app-icon { width: 30px; height: 30px; flex: 0 0 30px; }
            .gpt-model-picker-app-icon svg { display: block; width: 100%; height: 100%; }
            .gpt-model-picker-title-copy { min-width: 0; }
            .gpt-model-picker-title {
                overflow: hidden; color: #f2f5f8; font-size: 12px; font-weight: 700; line-height: 1.15;
                text-overflow: ellipsis; white-space: nowrap;
            }
            .gpt-model-picker-version {
                margin-top: 2px; overflow: hidden; color: #aeb2b6; font-size: 9px; line-height: 1.1;
                text-overflow: ellipsis; white-space: nowrap;
            }
            .gpt-model-picker-collapse {
                display: grid; width: 26px; height: 26px; flex: 0 0 26px; place-items: center; padding: 0;
                color: #dce2e8; background: transparent; border: 1px solid transparent; border-radius: 6px;
                font: 700 16px/1 Arial, sans-serif; cursor: pointer;
            }
            .gpt-model-picker-collapse:hover { background: #283f4d; border-color: #34404b; }
            .gpt-model-picker-content {
                display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column; gap: 5px;
                box-sizing: border-box; padding: 7px; overflow: hidden;
            }
            .gpt-model-picker-field { display: grid; flex: 0 0 auto; gap: 2px; min-width: 0; }
            .gpt-model-picker-field-label { color: #aeb2b6; font-size: 9px; }
            .gpt-model-picker-select, .gpt-model-picker-input {
                width: 100%; min-height: 28px; box-sizing: border-box; padding: 4px 6px;
                color: #f2f5f8; background: #222732; border: 1px solid #34404b;
                border-radius: 6px; font: 10.5px/1.2 Arial, sans-serif;
            }
            .gpt-model-picker-toggles {
                display: grid; flex: 0 0 auto; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px;
            }
            .gpt-model-picker-toggle {
                display: flex; min-width: 0; min-height: 27px; align-items: center; gap: 6px; box-sizing: border-box;
                padding: 3px 5px; color: #f2f5f8; background: #1d232a; border: 1px solid #2a323b;
                border-radius: 6px; cursor: pointer; user-select: none;
            }
            .gpt-model-picker-toggle span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            #gpt-model-picker-panel input.gpt-model-picker-checkbox {
                display: inline-block !important; width: 14px !important; height: 14px !important;
                flex: 0 0 14px !important; margin: 0 !important; padding: 0 !important;
                appearance: auto !important; -webkit-appearance: checkbox !important;
                position: static !important; visibility: visible !important; opacity: 1 !important;
                accent-color: #69afed !important; cursor: pointer;
            }
            .gpt-model-picker-diagnostics {
                display: grid; min-height: 0; flex: 1 1 auto; align-content: start; gap: 2px; box-sizing: border-box;
                padding: 6px; overflow: hidden; background: #0b0e11; border: 1px solid #2a323b; border-radius: 6px;
                font-size: 9.5px; line-height: 1.25;
            }
            .gpt-model-picker-status { color: #c7ccd1; word-break: break-word; white-space: pre-line; }
            .gpt-model-picker-status[data-status-type='success'] { color: #45c97a; }
            .gpt-model-picker-status[data-status-type='warning'] { color: #e3a12f; }
            .gpt-model-picker-status[data-status-type='error'] { color: #e16b6b; }
            .gpt-model-picker-hint {
                flex: 0 0 auto; color: #8d949c; font-size: 9px; line-height: 1.2;
            }
        `;

        document.head.append(style);
    }
    /** Останавливает наблюдатели, возвращает исходный fetch и удаляет панель. */
    function stop() {
        state.stopped = true;
        window.removeEventListener('resize', handleWindowResize);

        if (state.hookTimer !== null) {
            window.clearInterval(state.hookTimer);
            state.hookTimer = null;
        }

        if (state.resizeObserver) {
            state.resizeObserver.disconnect();
            state.resizeObserver = null;
        }

        if (state.navigationLinkObserver) {
            state.navigationLinkObserver.disconnect();
            state.navigationLinkObserver = null;
        }
        if (state.navigationMenuObserver) {
            state.navigationMenuObserver.disconnect();
            state.navigationMenuObserver = null;
        }

        removeNavigationLinks();

        const descriptor = Object.getOwnPropertyDescriptor(window, 'fetch');

        if (descriptor?.get === getGuardedFetch && descriptor?.set === setGuardedFetch) {
            Object.defineProperty(window, 'fetch', {
                configurable: state.originalFetchDescriptor?.configurable ?? true,
                enumerable: state.originalFetchDescriptor?.enumerable ?? true,
                writable: state.originalFetchDescriptor?.writable ?? true,
                value: state.downstreamFetch
            });
        }

        state.fetchGuardInstalled = false;

        state.panel?.remove();
        document.querySelector('#gpt-model-picker-styles')?.remove();
    }

    /** Запускает панель, ссылки боковой панели, перехват запросов и контроль window.fetch. */
    function start() {
        if (!(document.body instanceof HTMLElement)) {
            return;
        }

        addStyles();
        createPanel();
        observeNavigationLinks();
        installFetchGuard();
        state.hookTimer = window.setInterval(restoreHook, config.hookCheckIntervalMs);
        loadModels();
    }

    window[GLOBAL_KEY] = {
        config,
        state,
        start,
        stop,
        loadModels,
        setSelectedModel,
        setSelectedThinkingEffort,
        setFastModeEnabled,
        setForceChatEnabled,
        updateConversationBody,
        restoreHook,
        historicalModels,
        experimentalApiModels
    };

    start();
})();
