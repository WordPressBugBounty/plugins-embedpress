<?php
/*
 * Calendly settings page.
 * All undefined vars comes from 'render_settings_page' method
 *
 * Embedding Calendly (inline widget / popup) is free and needs no account
 * connection. The Calendly dashboard (connect your Calendly account, sync and
 * browse event types / scheduled events / invitees) is provided by EmbedPress
 * Pro through the `embedpress/settings/calendly_dashboard` action:
 *
 *     do_action( 'embedpress/settings/calendly_dashboard' );
 *
 * When nothing is hooked, free shows a static preview of the dashboard with
 * sample data under an upgrade overlay. Free makes no Calendly API calls.
 *  */

if (has_action('embedpress/settings/calendly_dashboard')) {
    do_action('embedpress/settings/calendly_dashboard');
    return;
}

// Static sample data for the locked preview.
$invtitees_list = [
    'e84408fc-d58a-421a-bf65-5efeefa182b0' => [
        'collection' => [
            0 => [
                'name' => 'John Smith'
            ]
        ]
    ],
    'caf8a25a-4021-48ef-9322-2487b239bbef' => [
        'collection' => [
            0 => [
                'name' => 'Emily Johnson'
            ]
        ]
    ],
    '9756459c-443e-4366-a147-98dc8b5aa09f' => [
        'collection' => [
            0 => [
                'name' => 'Michael Davis'
            ]
        ]
    ],
    'ebc4b1fe-2d19-4079-bac9-1988588717f8' => [
        'collection' => [
            0 => [
                'name' => 'Sarah Wilson'
            ]
        ]
    ],
    '232ab5df-50fb-4f16-a887-a00a2922c758' => [
        'collection' => [
            0 => [
                'name' => 'David Brown'
            ]
        ]
    ],
];

$scheduled_events = [
    'collection' => [
        [
            'uri' => 'https://api.calendly.com/scheduled_events/e84408fc-d58a-421a-bf65-5efeefa182b0',
            'name' => 'Coffee with John',
            'start_time' => '2034-08-24T03:30:00.000000Z',
            'end_time' => '2034-08-24T03:45:00.000000Z',
            'status' => 'active',
        ],
        [
            'uri' => 'https://api.calendly.com/scheduled_events/caf8a25a-4021-48ef-9322-2487b239bbef',
            'name' => 'Coffee with John',
            'start_time' => '2030-08-31T03:00:00.000000Z',
            'end_time' => '2030-08-31T03:15:00.000000Z',
            'status' => 'canceled',
        ],
        [
            'uri' => 'https://api.calendly.com/scheduled_events/9756459c-443e-4366-a147-98dc8b5aa09f',
            'name' => 'Coffee with John',
            'start_time' => '2024-09-04T09:00:00.000000Z',
            'end_time' => '2024-09-04T09:15:00.000000Z',
            'status' => 'active',
        ],
        [
            'uri' => 'https://api.calendly.com/scheduled_events/ebc4b1fe-2d19-4079-bac9-1988588717f8',
            'name' => 'Coffee with John',
            'start_time' => '2023-09-05T03:00:00.000000Z',
            'end_time' => '2023-09-05T03:15:00.000000Z',
            'status' => 'active',
        ],
        [
            'uri' => 'https://api.calendly.com/scheduled_events/232ab5df-50fb-4f16-a887-a00a2922c758',
            'name' => 'Town Hall Meeting',
            'start_time' => '2023-09-06T03:00:00.000000Z',
            'end_time' => '2023-09-06T03:15:00.000000Z',
            'status' => 'active',
        ],
    ]
];

$event_types = [
    'collection' => [
        [
            'scheduling_url' => 'https://calendly.com/akash-mia/30min',
            'name' => '30 Minute Meeting',
            'active' => true,
            'color' => '#8247f5'
        ],
        [
            'scheduling_url' => 'https://calendly.com/akash-mia/coffee-with-john-doe',
            'name' => 'Coffee with John',
            'active' => true,
            'color' => '#e55cff'
        ],
        [
            'scheduling_url' => 'https://calendly.com/akash-mia/asia-cup-2023',
            'name' => 'Asia Cup 2023',
            'active' => false,
            'color' => '#ccf000'
        ],
        [
            'scheduling_url' => 'https://calendly.com/akash-mia/dailly-stand-up-meeting',
            'name' => 'Dailly Stand-up meeting',
            'active' => false,
            'color' => '#ffa600'
        ],
        [
            'scheduling_url' => 'https://calendly.com/akash-mia/icc-mega-event',
            'name' => 'ICC Mega Event',
            'active' => true,
            'color' => '#0ae8f0'
        ],
        [
            'scheduling_url' => 'https://calendly.com/akash-mia/wpdeveloper-team-meeting',
            'name' => 'WPDeveloper Team meeting',
            'active' => false,
            'color' => '#8247f5'
        ],
    ]
];

$calendly_uuid = function ($url) {
    return preg_match('/\/([0-9a-fA-F-]+)$/', $url, $matches) ? $matches[1] : '';
};

?>

<div class="embedpress_calendly_settings  background__white radius-25 p40">
    <h3 class="calendly-settings-title"><?php esc_html_e("Calendly Settings", "embedpress"); ?></h3>
    <div class="calendly-embedpress-authorize-button">

        <div class="calendly-connector-container">
            <div class="account-wrap full-width-layout">

                <a href="<?php echo esc_url('https://wpdeveloper.com/in/upgrade-embedpress'); ?>" class="calendly-connect-button" target="_blank" rel="noopener noreferrer" title="<?php echo esc_attr__('Connecting your Calendly account is available in EmbedPress Pro', 'embedpress'); ?>">
                    <img class="embedpress-calendly-icon" src="<?php echo esc_url(EMBEDPRESS_URL_ASSETS . 'images/calendly.svg') ?>" alt="calendly">
                    <?php echo esc_html__('Connect with Calendly', 'embedpress'); ?> <span class="isPro">PRO</span>
                </a>
            </div>

        </div>
        <div class="tab-container">
            <div class="calendly-Event-button tab active-tab" onclick="showTab('event-types')"><?php echo esc_html__('Event Types', 'embedpress'); ?></div>
            <!-- Scheduled Events Tab -->
            <div class="calendly-Scheduled-button tab" onclick="showTab('scheduled-events')"><?php echo esc_html__('Scheduled Events', 'embedpress'); ?></div>
        </div>

    </div>

    <!-- Event Types Content -->
    <div class="tab-content active" id="event-types">
        <div class="event-type-list">
            <div class="event-type-group-list">
                <div class="event-type-group-list-item user-item">

                    <div class="list-header">
                        <?php echo esc_html__('Events', 'embedpress'); ?>
                    </div>
                    <div class="calendly-data-placeholder">
                        <div class="event-type-card-list">
                            <?php
                            if (is_array($event_types) && isset($event_types['collection']) && count($event_types['collection']) > 0) {
                                foreach ($event_types['collection'] as $item) :
                                    $status = 'In-active';
                                    if (!empty($item['active'])) {
                                        $status = 'Active';
                                    }
                                    ?>
                                    <div class="event-type-card-list-item" data-event-status="<?php echo esc_attr($status); ?>" style="--calendly-event-color: <?php echo esc_attr($item['color']); ?>;">
                                        <div class="event-type-card">
                                            <div class="event-type-card-top">
                                                <h2><?php echo esc_html($item['name']); ?></h2>
                                                <p>30 mins, One-on-One</p>
                                                <a target="_blank" href="<?php echo esc_url($item['scheduling_url']); ?>"><?php echo esc_html__('View booking page', 'embedpress'); ?></a>
                                            </div>
                                            <div class="event-type-card-bottom">
                                                <div class="calendly-event-copy-link" data-event-link="<?php echo esc_url($item['scheduling_url']); ?>">
                                                    <svg width="40" height="40" viewBox="0 0 0.75 0.75" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path fill-rule="evenodd" clip-rule="evenodd" d="M0.05 0.476a0.076 0.076 0 0 0 0.076 0.074H0.2V0.5H0.126A0.026 0.026 0 0 1 0.1 0.474V0.124A0.026 0.026 0 0 1 0.126 0.098h0.35a0.026 0.026 0 0 1 0.026 0.026V0.2H0.276A0.076 0.076 0 0 0 0.2 0.276v0.35A0.076 0.076 0 0 0 0.276 0.7h0.35A0.076 0.076 0 0 0 0.702 0.624V0.274A0.076 0.076 0 0 0 0.626 0.2H0.55V0.126A0.076 0.076 0 0 0 0.476 0.05H0.126a0.076 0.076 0 0 0 -0.076 0.076v0.35Zm0.2 -0.2A0.026 0.026 0 0 1 0.276 0.25h0.35a0.026 0.026 0 0 1 0.026 0.026v0.35a0.026 0.026 0 0 1 -0.026 0.026H0.276A0.026 0.026 0 0 1 0.25 0.626V0.276Z" fill="#3664ae" /></svg>
                                                    <span><?php echo esc_html__('Copy link', 'embedpress'); ?></span>
                                                </div>
                                                <div class="event-status <?php echo esc_attr($status); ?>">
                                                    <?php echo esc_html($status); ?>
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                            <?php
                                endforeach;
                            }
                            ?>
                        </div>

                        <div class="overlay">
                            <a href="<?php echo esc_url('https://wpdeveloper.com/in/upgrade-embedpress'); ?>" class="overlay-button" target="_blank"><?php echo esc_html__('Get PRO to Unlock', 'embedpress'); ?></a>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    </div>

    <!-- Scheduled Events Content -->
    <div class="tab-content" id="scheduled-events">

        <div class="calendly-day-list">
            <div class="calendly-data-placeholder">
                <table class="rwd-table" cellspacing="0">
                    <tbody>
                        <tr>
                            <th><?php esc_html_e('Date & Time', 'embedpress'); ?></th>
                            <th><?php esc_html_e('Event Type', 'embedpress'); ?></th>
                            <th><?php esc_html_e('Attendee', 'embedpress'); ?></th>
                            <th><?php esc_html_e('Scheduled', 'embedpress'); ?></th>
                            <th><?php esc_html_e('Status', 'embedpress'); ?></th>
                        </tr>
                        <?php
                        $index = 0;
                        $current_datetime = new DateTime(); // Get the current date and time

                        $upcoming_events = [];
                        $past_events = [];

                        if (is_array($scheduled_events) && isset($scheduled_events['collection']) && count($scheduled_events) > 0) {
                            foreach ($scheduled_events['collection'] as $event) {
                                $uuid = $calendly_uuid($event['uri']);


                                $name = isset($invtitees_list[$uuid]['collection'][$index]['name']) ? $invtitees_list[$uuid]['collection'][$index]['name'] : null;

                                // Convert event start and end times to DateTime objects
                                $start_time = new DateTime($event['start_time']);
                                $end_time = new DateTime($event['end_time']);

                                // Check if the event is in the past or upcoming
                                $is_past_event = $end_time < $current_datetime;

                                // Categorize events into upcoming and past
                                if ($is_past_event) {
                                    $past_events[] = [
                                        'event' => $event,
                                        'name' => $name,
                                    ];
                                } else {
                                    $upcoming_events[] = [
                                        'event' => $event,
                                        'name' => $name,
                                    ];
                                }
                            }
                        }

                        // Sort upcoming events by start time
                        usort($upcoming_events, function ($a, $b) {
                            return strtotime($a['event']['start_time']) - strtotime($b['event']['start_time']);
                        });

                        // Sort past events by start time in descending order
                        usort($past_events, function ($a, $b) {
                            return strtotime($b['event']['start_time']) - strtotime($a['event']['start_time']);
                        });

                        // Merge upcoming and past events for display
                        $sorted_events = array_merge($upcoming_events, $past_events);


                        if (is_array($sorted_events) && count($sorted_events) > 0) :
                            foreach ($sorted_events as $event_data) :
                                $event = $event_data['event'];
                                $name = $event_data['name'];

                                // Convert event start and end times to DateTime objects
                                $start_time = new DateTime($event['start_time']);
                                $end_time = new DateTime($event['end_time']);

                                // Check if the event is in the past or upcoming
                                $is_past_event = $end_time < $current_datetime;
                                ?>

                                <tr>
                                    <td class="event-time">
                                        <small><?php echo esc_html(date('D, j M Y', strtotime($event['start_time']))); ?><br></small>
                                        <?php echo esc_html(date('h:ia', strtotime($event['start_time'])) . ' - ' . date('h:ia', strtotime($event['end_time']))); ?>
                                    </td>
                                    <td class="event-info">
                                        <?php echo esc_html($event['name']); ?>
                                    </td>
                                    <td class="attendee">
                                        <?php echo esc_html($name); ?>
                                    </td>
                                    <td class="event-action">
                                        <?php echo $is_past_event ? 'Past' : 'Upcoming'; ?>
                                    </td>
                                    <td class="scheduled-status">
                                        <?php echo esc_html(ucfirst($event['status'])); ?>
                                    </td>
                                </tr>

                        <?php endforeach;
                        endif; ?>

                    </tbody>
                </table>

                <div class="overlay">
                    <a href="<?php echo esc_url('https://wpdeveloper.com/in/upgrade-embedpress'); ?>" class="overlay-button" target="_blank"><?php echo esc_html__('Get PRO to Unlock', 'embedpress'); ?></a>
                </div>
            </div>
        </div>
    </div>

    <script>
        // JavaScript function to switch between tabs
        function showTab(tabId) {
            const tabs = document.querySelectorAll('.tab');
            const tabContents = document.querySelectorAll('.tab-content');

            // Hide all tab contents
            tabContents.forEach(content => {
                content.classList.remove('active');
            });

            // Deactivate all tabs
            tabs.forEach(tab => {
                tab.classList.remove('active-tab');
            });

            // Activate the selected tab
            document.getElementById(tabId).classList.add('active');
            event.currentTarget.classList.add('active-tab');
        }
    </script>



</div>