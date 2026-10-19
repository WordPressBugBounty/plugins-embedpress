import React, { useState, useEffect } from 'react';
import DateRangePicker from './DateRangePicker';
import ExportUpsell from './ExportUpsell';



const { __ } = wp.i18n;

/**
 * Off the global, not imported — see the note in AnalyticsDashboard.js. An
 * import would bundle a private hooks registry that Pro cannot reach.
 */
const { applyFilters } = wp.hooks;

const Header = ({ onDateRangeChange, onExport, onRefreshCache }) => {
    const isProActive = window.embedpressAnalyticsData?.isProActive || false;

    // Initialize with the value from WordPress localized data
    const [isTrackingEnabled, setIsTrackingEnabled] = useState(
        Boolean(window.embedpressAnalyticsData?.trackingEnabled)
    );
    const [isLoading, setIsLoading] = useState(false);
    // Visitor geolocation is a separate, explicit opt-in (off by default):
    // when on, visitor IPs are sent over HTTPS to a third-party lookup service.
    const [isGeolocationEnabled, setIsGeolocationEnabled] = useState(
        Boolean(window.embedpressAnalyticsData?.geolocationEnabled)
    );
    const [isGeoLoading, setIsGeoLoading] = useState(false);

    // Load current tracking setting on component mount
    useEffect(() => {
        loadTrackingSetting();
    }, []);

    const loadTrackingSetting = async () => {
        try {
            const response = await fetch(`${window.embedpressAnalyticsData?.restUrl}tracking-setting`, {
                method: 'GET',
                headers: {
                    'X-WP-Nonce': window.embedpressAnalyticsData?.nonce || '',
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin'
            });

            if (response.ok) {
                const data = await response.json();
                setIsTrackingEnabled(Boolean(data.enabled)); // Use actual boolean value
                setIsGeolocationEnabled(Boolean(data.geolocation_enabled));
            }
        } catch (error) {
            // Use the value from WordPress localized data as fallback
            setIsTrackingEnabled(Boolean(window.embedpressAnalyticsData?.trackingEnabled));
        }
    };

    const handleTrackingToggle = async (enabled) => {
        setIsLoading(true);
        try {
            const response = await fetch(`${window.embedpressAnalyticsData?.restUrl}tracking-setting`, {
                method: 'POST',
                headers: {
                    'X-WP-Nonce': window.embedpressAnalyticsData?.nonce || '',
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({ enabled })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    setIsTrackingEnabled(enabled);

                    // Notify user of the change
                    // Update the global variable for immediate effect
                    if (window.embedpressAnalyticsData) {
                        window.embedpressAnalyticsData.trackingEnabled = enabled;
                    }
                } else {
                    throw new Error(data.message || 'Failed to update tracking setting');
                }
            } else {
                throw new Error('Failed to update tracking setting');
            }
        } catch (error) {
            // Revert the toggle on error
            setIsTrackingEnabled(!enabled);
        } finally {
            setIsLoading(false);
        }
    };
    const handleGeolocationToggle = async (enabled) => {
        setIsGeoLoading(true);
        setIsGeolocationEnabled(enabled);
        try {
            const response = await fetch(`${window.embedpressAnalyticsData?.restUrl}tracking-setting`, {
                method: 'POST',
                headers: {
                    'X-WP-Nonce': window.embedpressAnalyticsData?.nonce || '',
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({ geolocation_enabled: enabled })
            });
            const data = response.ok ? await response.json() : null;
            if (!data || !data.success) {
                throw new Error('Failed to update geolocation setting');
            }
            setIsGeolocationEnabled(Boolean(data.geolocation_enabled));
            if (window.embedpressAnalyticsData) {
                window.embedpressAnalyticsData.geolocationEnabled = Boolean(data.geolocation_enabled);
            }
        } catch (error) {
            setIsGeolocationEnabled(!enabled);
        } finally {
            setIsGeoLoading(false);
        }
    };

    return (
        <>
            <div className='ep-header-wrapper'>
                <div className='header-content'>
                    <h3 className="dashboard-title">{__('Embedded Content Analytics Summary', 'embedpress')}</h3>
                    <p>{__('Get insights of your embedded PDF, video, audio, and 250+ other source performances with EmbedPress', 'embedpress')}</p>
                </div>
                <div className='header-info'>
                    <div className='button-wrapper'>
                        {/* Analytics Tracking Toggle */}
                        <div className='ep-tracking-toggle-wrapper'>
                            <label className='ep-tracking-toggle-label'>
                                <span className='ep-tracking-toggle-text'>
                                    {__('Analytics Tracking', 'embedpress')}
                                </span>
                                <div className='ep-tracking-toggle'>
                                    <input
                                        type='checkbox'
                                        checked={isTrackingEnabled}
                                        onChange={(e) => handleTrackingToggle(e.target.checked)}
                                        disabled={isLoading}
                                        className='ep-tracking-toggle-input'
                                    />
                                    <span className='ep-tracking-toggle-slider'></span>
                                </div>
                            </label>
                        </div>

                        <DateRangePicker onDateRangeChange={onDateRangeChange} />
                        {/* Free's default is the export upsell; Pro's filter
                            replaces it with the real export menu. If Pro is
                            active but its script didn't register the filter,
                            fall back to a plain CSV export (Pro's PHP still
                            serves the export endpoint). */}
                        {applyFilters(
                            'embedpress.analytics.exportControl',
                            isProActive ? null : <ExportUpsell />,
                            { onExport }
                        ) ?? (
                            <button
                                className='ep-btn'
                                onClick={() => onExport('csv')}
                            >
                                {__('Export CSV', 'embedpress')}
                            </button>
                        )}
                        <button
                            className='ep-btn'
                            onClick={onRefreshCache}
                            title={__('Refresh embed count cache', 'embedpress')}
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <g clipPath="url(#clip0_2104_4599)">
                                    <path d="M2.69922 7.33329C2.86781 6.04712 3.49937 4.86648 4.47567 4.01237C5.45198 3.15827 6.70609 2.68926 8.00326 2.69314C9.30043 2.69702 10.5517 3.17352 11.5229 4.03345C12.4941 4.89337 13.1186 6.07777 13.2795 7.36493C13.4404 8.65209 13.1266 9.95376 12.397 11.0263C11.6674 12.0988 10.5719 12.8687 9.31559 13.1917C8.05929 13.5148 6.72831 13.3689 5.5718 12.7814C4.4153 12.1939 3.51255 11.2051 3.03255 9.99996M2.69922 13.3333V9.99996H6.03255" stroke="#5B4E96" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </g>
                                <defs>
                                    <clipPath id="clip0_2104_4599">
                                        <rect width="16" height="16" fill="white" />
                                    </clipPath>
                                </defs>
                            </svg>
                        </button>

                    </div>
                </div>
            </div>
            <div className='ep-geolocation-setting'>
                <div className='button-wrapper'>
                    <div className='ep-tracking-toggle-wrapper'>
                        <label className='ep-tracking-toggle-label'>
                            <span className='ep-tracking-toggle-text'>
                                {__('Visitor Geolocation', 'embedpress')}
                            </span>
                            <div className='ep-tracking-toggle'>
                                <input
                                    type='checkbox'
                                    checked={isGeolocationEnabled}
                                    onChange={(e) => handleGeolocationToggle(e.target.checked)}
                                    disabled={isGeoLoading}
                                    className='ep-tracking-toggle-input'
                                />
                                <span className='ep-tracking-toggle-slider'></span>
                            </div>
                        </label>
                    </div>
                </div>
                <p className='ep-geolocation-setting__note'>
                    {isGeolocationEnabled
                        ? __('On: when no CDN country header is available, each visitor\'s IP address is sent over HTTPS to ipapi.co (fallback: ipinfo.io) to look up their country and city. Mention this in your privacy policy.', 'embedpress')
                        : __('Off: analytics sends no visitor IP address off your site. Country is read only from your CDN or server headers (e.g. Cloudflare CF-IPCountry) and is otherwise shown as Unknown. Turning this on sends visitor IP addresses to ipapi.co / ipinfo.io.', 'embedpress')}
                    {' '}
                    {__('This setting covers analytics only. Country restrictions configured on individual embeds always look up the visitor\'s country: from your CDN header first, otherwise by sending the visitor\'s IP address over HTTPS to ipapi.co (fallback: ipinfo.io).', 'embedpress')}
                </p>
            </div>
        </>
    );
};

export default Header;
