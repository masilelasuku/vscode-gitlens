import type { RequestError } from '@octokit/request-error';
import type { CancellationToken } from 'vscode';
import { version as codeVersion, env, window } from 'vscode';
import type { RequestInfo, RequestInit, Response } from '@env/fetch';
import { fetch as _fetch, getProxyAgent } from '@env/fetch';
import { getPlatform } from '@env/platform';
import type { Disposable } from '../../api/gitlens';
import type { Container } from '../../container';
import {
	AuthenticationError,
	AuthenticationErrorReason,
	CancellationError,
	ProviderRequestClientError,
	ProviderRequestNotFoundError,
	ProviderRequestRateLimitError,
} from '../../errors';
import {
	showIntegrationRequestFailed500WarningMessage,
	showIntegrationRequestTimedOutWarningMessage,
} from '../../messages';
import { memoize } from '../../system/decorators/memoize';
import { Logger } from '../../system/logger';
import type { LogScope } from '../../system/logger.scope';
import { getLogScope } from '../../system/logger.scope';

export interface FetchOptions {
	cancellation?: CancellationToken;
	timeout?: number;
	userAgent?: string;
}

export interface Retriever {
	id: string;
	name: string;
	statusPageUrl?: string;
	token?: string;
	trackRequestException(): void;
	resetRequestExceptionCount(): void;
}

export class FetchingService implements Disposable {
	constructor(private readonly container: Container) {}

	dispose() {}

	@memoize()
	get userAgent(): string {
		// TODO@eamodio figure out standardized format/structure for our user agents
		return `${this.container.debugging ? 'GitLens-Debug' : this.container.prerelease ? 'GitLens-Pre' : 'GitLens'}/${
			this.container.version
		} (${env.appName}/${codeVersion}; ${getPlatform()})`;
	}

	async fetch(provider: Retriever, url: RequestInfo, init?: RequestInit, options?: FetchOptions): Promise<Response> {
		const scope = getLogScope();

		if (options?.cancellation?.isCancellationRequested) throw new CancellationError();

		const aborter = new AbortController();

		let timeout;
		if (options?.cancellation != null) {
			timeout = options.timeout; // Don't set a default timeout if we have a cancellation token
			options.cancellation.onCancellationRequested(() => aborter.abort());
		} else {
			timeout = options?.timeout ?? 60 * 1000;
		}

		const timer = timeout != null ? setTimeout(() => aborter.abort(), timeout) : undefined;

		try {
			const promise = _fetch(url, {
				agent: getProxyAgent(),
				...init,
				headers: {
					'User-Agent': options?.userAgent || '',
					...init?.headers,
				},
				signal: aborter?.signal,
			});
			void promise.finally(() => clearTimeout(timer));
			const result = await promise;
			provider.resetRequestExceptionCount();
			return result;
		} catch (ex) {
			this.handleRequestError(provider, ex, scope);
			throw ex;
		}
	}

	private handleRequestError(
		provider: Retriever,
		ex: RequestError | (Error & { name: 'AbortError' }),
		scope: LogScope | undefined,
	): void {
		if (ex instanceof CancellationError) throw ex;
		if (ex.name === 'AbortError') throw new CancellationError(ex);

		switch (ex.status) {
			case 404: // Not found
			case 410: // Gone
			case 422: // Unprocessable Entity
				throw new ProviderRequestNotFoundError(ex);
			// case 429: //Too Many Requests
			case 401: // Unauthorized
				throw new AuthenticationError(provider.id, AuthenticationErrorReason.Unauthorized, ex);
			case 403: // Forbidden
				if (ex.message.includes('rate limit')) {
					let resetAt: number | undefined;

					const reset = ex.response?.headers?.['x-ratelimit-reset'];
					if (reset != null) {
						resetAt = parseInt(reset, 10);
						if (Number.isNaN(resetAt)) {
							resetAt = undefined;
						}
					}

					throw new ProviderRequestRateLimitError(ex, provider.token, resetAt);
				}
				throw new AuthenticationError('gitkraken', AuthenticationErrorReason.Forbidden, ex);
			case 500: // Internal Server Error
				Logger.error(ex, scope);
				if (ex.response != null) {
					this.container.subscription.trackRequestException();
					void showIntegrationRequestFailed500WarningMessage(
						`${provider.name} failed to respond and might be experiencing issues.${
							provider.statusPageUrl
								? `Please visit the [${provider.name} status page](${provider.statusPageUrl}) for more information.`
								: ''
						}`,
					);
				}
				return;
			case 502: // Bad Gateway
				Logger.error(ex, scope);
				if (ex.message.includes('timeout')) {
					provider?.trackRequestException();
					void showIntegrationRequestTimedOutWarningMessage(provider.name);
				}
				break;
			case 503: // Service Unavailable
				Logger.error(ex, scope);
				this.container.subscription.trackRequestException();
				void showIntegrationRequestFailed500WarningMessage(
					`${provider.name} failed to respond and might be experiencing issues.${
						provider.statusPageUrl
							? `Please visit the [${provider.name} status page](${provider.statusPageUrl}) for more information.`
							: ''
					}`,
				);
				return;
			default:
				if (ex.status >= 400 && ex.status < 500) throw new ProviderRequestClientError(ex);
				break;
		}

		if (Logger.isDebugging) {
			void window.showErrorMessage(
				`${provider.name} request failed: ${(ex.response as any)?.errors?.[0]?.message ?? ex.message}`,
			);
		}
	}
}
