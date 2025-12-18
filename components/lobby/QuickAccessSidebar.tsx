'use client';

import React from 'react';

interface QuickAccessSidebarProps {
    mobile?: boolean;
    compact?: boolean;
    showOnlyWhenQuestCompleted?: boolean;
    fillHeight?: boolean;
}

const QuickAccessSidebar: React.FC<QuickAccessSidebarProps> = ({ 
    mobile = false, 
    compact = false, 
    showOnlyWhenQuestCompleted = false, 
    fillHeight = true 
}) => {
    // TODO: 실제 핸들러 연결 필요
    const handlers = {
        openQuests: () => console.log('퀘스트 열기'),
        openGameRecordList: () => console.log('기보 열기'),
        openBlacksmithModal: () => console.log('대장간 열기'),
        openShop: () => console.log('상점 열기'),
        openInventory: () => console.log('가방 열기'),
    };

    const hasClaimableQuest = false; // TODO: 실제 상태 연결 필요
    const unreadMailCount = 0; // TODO: 실제 상태 연결 필요

    if (showOnlyWhenQuestCompleted && !hasClaimableQuest) {
        return null;
    }

    const hasUnreadMail = unreadMailCount > 0;

    const allButtons = [
        { label: '퀘스트', iconUrl: '/images/quickmenu/quest.png', handler: handlers.openQuests, disabled: false, notification: hasClaimableQuest },
        { label: '기보', iconUrl: '/images/quickmenu/gibo.png', handler: handlers.openGameRecordList, disabled: false, notification: false },
        { label: '대장간', iconUrl: '/images/quickmenu/enhance.png', handler: handlers.openBlacksmithModal, disabled: false, notification: false },
        { label: '상점', iconUrl: '/images/quickmenu/store.png', handler: handlers.openShop, disabled: false, notification: false },
        { label: '가방', iconUrl: '/images/quickmenu/bag.png', handler: handlers.openInventory, disabled: false, notification: false },
    ];
    
    const containerClass = mobile 
        ? "flex justify-around items-center gap-2"
        : compact
        ? `bg-panel rounded-lg p-1 flex flex-col justify-around gap-1 ${fillHeight ? 'h-full' : ''}`
        : `bg-panel rounded-lg p-2 flex flex-col justify-around gap-2 ${fillHeight ? 'h-full' : ''}`;
    
    const buttonClass = mobile
        ? "flex flex-col items-center justify-center p-2 rounded-lg w-16 h-16 bg-gradient-to-br from-gray-700/80 via-gray-600/70 to-gray-700/80 hover:from-gray-600/90 hover:via-gray-500/80 hover:to-gray-600/90 border-2 border-gray-500/50 hover:border-gray-400/70 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 active:scale-95"
        : compact
        ? `flex flex-col items-center justify-center p-2 rounded-lg w-full bg-gradient-to-br from-gray-700/80 via-gray-600/70 to-gray-700/80 hover:from-gray-600/90 hover:via-gray-500/80 hover:to-gray-600/90 border-2 border-gray-500/50 hover:border-gray-400/70 shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105 active:scale-95`
        : `flex flex-col items-center justify-center p-3 rounded-xl w-full bg-gradient-to-br from-gray-700/90 via-gray-600/80 to-gray-700/90 hover:from-gray-600/95 hover:via-gray-500/85 hover:to-gray-600/95 border-2 border-gray-500/60 hover:border-gray-400/80 shadow-lg hover:shadow-2xl transition-all duration-200 transform hover:scale-105 active:scale-95`;
    
    const iconSize = mobile ? "w-7 h-7 object-contain drop-shadow-md" : compact ? "w-9 h-9 object-contain drop-shadow-md" : "w-10 h-10 object-contain drop-shadow-lg";
    const labelSize = mobile ? "text-[11px] mt-1.5 font-semibold text-gray-200" : compact ? "text-[11px] mt-1.5 font-semibold text-gray-200" : "text-sm mt-2 font-bold text-gray-100";
    
    const notificationDotClass = mobile
        ? "absolute top-1 right-1 bg-red-500 rounded-full w-2.5 h-2.5 border-2 border-gray-800"
        : `absolute top-1 right-1 bg-red-500 rounded-full w-2.5 h-2.5 border-2 ${compact ? 'border-gray-800' : 'border-gray-800/50'}`;
    
    const notificationCountClass = mobile
        ? "absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center border-2 border-gray-800"
        : `absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold rounded-full ${compact ? 'w-4 h-4' : 'w-5 h-5'} flex items-center justify-center border-2 ${compact ? 'border-gray-800' : 'border-gray-800/50'}`;

    const renderButton = (btn: typeof allButtons[0]) => (
        <button
            key={btn.label}
            onClick={(e) => { e.preventDefault(); btn.handler(); }}
            disabled={btn.disabled}
            className={`relative flex-1 ${buttonClass} disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
            title={btn.label}
        >
            <img src={btn.iconUrl} alt={btn.label} className={iconSize} />
            <span className={labelSize}>{btn.label}</span>
            {btn.notification && (
                (btn as any).count && (btn as any).count > 0 ? (
                    <span className={notificationCountClass}>
                        {(btn as any).count > 9 ? '9+' : (btn as any).count}
                    </span>
                ) : (
                    <span className={notificationDotClass}></span>
                )
            )}
        </button>
    );

    return (
        <div className={containerClass}>
            {allButtons.map(renderButton)}
        </div>
    );
};

export default QuickAccessSidebar;

