package com.pastebin.paste.application;

import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.CreatePasteResponse;
import com.pastebin.paste.api.dto.PasteFileRequest;
import com.pastebin.paste.api.dto.PasteFileResponse;
import com.pastebin.paste.api.dto.PasteViewResponse;
import com.pastebin.paste.domain.DeletionCapabilityUtil;
import com.pastebin.paste.domain.NanoIdGenerator;
import com.pastebin.paste.domain.Folder;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.PasteFile;
import com.pastebin.paste.domain.PasteStar;
import com.pastebin.paste.domain.PasteVote;
import com.pastebin.paste.domain.VoteType;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.FolderRepository;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.paste.infrastructure.PasteStarRepository;
import com.pastebin.paste.infrastructure.PasteVoteRepository;
import com.pastebin.shared.errors.ArchiveLimitException;
import com.pastebin.shared.errors.BadRequestException;
import com.pastebin.shared.errors.ConflictException;
import com.pastebin.shared.errors.ForbiddenException;
import com.pastebin.shared.errors.PayloadTooLargeException;
import com.pastebin.shared.errors.ResourceNotFoundException;
import com.pastebin.shared.errors.UnauthorizedException;
import com.pastebin.shared.security.FilenameSanitizer;
import com.pastebin.shared.security.RateLimiterService;
import com.pastebin.paste.api.dto.CreateEncryptedPasteRequest;
import com.pastebin.paste.api.dto.EncryptedFilePayload;
import com.pastebin.paste.domain.EncryptionMode;
import com.pastebin.paste.domain.ModerationState;
import com.pastebin.paste.domain.ShareAccessState;
import com.pastebin.paste.domain.ShareTokenUtil;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class PasteService {

    private static final Logger log = LoggerFactory.getLogger(PasteService.class);

    public static final int MAX_FILES_PER_PASTE = 20;

    private static final Set<String> RESERVED_SLUGS = Set.of(
            "api", "raw", "embed", "download", "download-zip", "discovery", "login", "register",
            "auth", "account", "404", "admin", "system", "health", "metrics", "actuator",
            "test", "paste", "pastes", "new", "settings", "terms", "privacy", "about", "help"
    );

    private final PasteRepository pasteRepository;
    private final FolderRepository folderRepository;
    private final NanoIdGenerator nanoIdGenerator;
    private final RateLimiterService rateLimiterService;
    private final PasswordEncoder passwordEncoder;
    private final MeterRegistry meterRegistry;
    private final PasteVoteRepository pasteVoteRepository;
    private final PasteStarRepository pasteStarRepository;
    private final LibraryService libraryService;
    private final UnlockTokenService unlockTokenService;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper = new com.fasterxml.jackson.databind.ObjectMapper();

    @Value("${pastebin.content.max-bytes:1048576}")
    private int maxContentBytes;

    @Value("${pastebin.share.archive-max-entries:50}")
    private int archiveMaxEntries = 50;

    @Value("${pastebin.share.archive-max-bytes:10485760}")
    private long archiveMaxBytes = 10485760L;

    @Value("${pastebin.share.archive-max-output-bytes:10485760}")
    private long archiveMaxOutputBytes = 10485760L;

    @Value("${pastebin.share.public-base-url:http://localhost:5173}")
    private String publicBaseUrl = "http://localhost:5173";

    private final org.springframework.beans.factory.ObjectProvider<com.pastebin.discovery.application.PasteActivityIngestionService> activityIngestionService;
    private final org.springframework.beans.factory.ObjectProvider<com.pastebin.discovery.infrastructure.meilisearch.MeilisearchIndexService> meilisearchIndexServiceProvider;
    private final ApplicationEventPublisher eventPublisher;

    @org.springframework.beans.factory.annotation.Autowired
    public PasteService(PasteRepository pasteRepository,
                        FolderRepository folderRepository,
                        NanoIdGenerator nanoIdGenerator,
                        RateLimiterService rateLimiterService,
                        PasswordEncoder passwordEncoder,
                        MeterRegistry meterRegistry,
                        PasteVoteRepository pasteVoteRepository,
                        PasteStarRepository pasteStarRepository,
                        org.springframework.beans.factory.ObjectProvider<LibraryService> libraryService,
                        UnlockTokenService unlockTokenService,
                        org.springframework.beans.factory.ObjectProvider<com.pastebin.discovery.application.PasteActivityIngestionService> activityIngestionService,
                        org.springframework.beans.factory.ObjectProvider<com.pastebin.discovery.infrastructure.meilisearch.MeilisearchIndexService> meilisearchIndexServiceProvider,
                        ApplicationEventPublisher eventPublisher) {
        this.pasteRepository = pasteRepository;
        this.folderRepository = folderRepository;
        this.nanoIdGenerator = nanoIdGenerator;
        this.rateLimiterService = rateLimiterService;
        this.passwordEncoder = passwordEncoder;
        this.meterRegistry = meterRegistry;
        this.pasteVoteRepository = pasteVoteRepository;
        this.pasteStarRepository = pasteStarRepository;
        this.libraryService = libraryService.getIfAvailable();
        this.unlockTokenService = unlockTokenService;
        this.activityIngestionService = activityIngestionService;
        this.meilisearchIndexServiceProvider = meilisearchIndexServiceProvider;
        this.eventPublisher = eventPublisher;
    }

    @jakarta.annotation.PostConstruct
    public void validateArchiveLimits() {
        if (archiveMaxEntries <= 0) {
            throw new IllegalStateException("pastebin.share.archive-max-entries must be greater than 0");
        }
        if (archiveMaxBytes <= 0) {
            throw new IllegalStateException("pastebin.share.archive-max-bytes must be greater than 0");
        }
        if (archiveMaxOutputBytes <= 0) {
            throw new IllegalStateException("pastebin.share.archive-max-output-bytes must be greater than 0");
        }
    }

    public PasteService(PasteRepository pasteRepository,
                        FolderRepository folderRepository,
                        NanoIdGenerator nanoIdGenerator,
                        RateLimiterService rateLimiterService,
                        PasswordEncoder passwordEncoder,
                        PasteVoteRepository pasteVoteRepository,
                        PasteStarRepository pasteStarRepository) {
        this(pasteRepository, folderRepository, nanoIdGenerator, rateLimiterService, passwordEncoder, new SimpleMeterRegistry(), pasteVoteRepository, pasteStarRepository, null, null, null, null, event -> { });
    }

    @Transactional
    public CreatePasteResponse createPaste(CreatePasteRequest request, Long authenticatedUserId, String clientIp) {
        // 1. Private paste authorization requirement
        if (request.visibility() == Visibility.PRIVATE && authenticatedUserId == null) {
            throw new ForbiddenException("Creating private pastes requires an authenticated account.");
        }

        // Anti-bot honeypot check: reject if hidden bot field is populated
        if (request.website() != null && !request.website().isBlank()) {
            throw new BadRequestException("Automated submission detected.");
        }

        // 2. Rate limiting for anonymous and authenticated submissions
        if (authenticatedUserId == null) {
            rateLimiterService.checkRateLimit("create:ip:" + clientIp, 30, 3600);
        } else {
            rateLimiterService.checkRateLimit("create:user:" + authenticatedUserId, 120, 3600);
        }

        // 3. Resolve and validate files (backward compatible with single content)
        List<PasteFileRequest> inputFiles = request.files();
        if (inputFiles == null || inputFiles.isEmpty()) {
            if (request.content() == null || request.content().isBlank()) {
                throw new BadRequestException("Paste must contain content or at least one file.");
            }
            String derivedFilename = deriveFilename(request.title(), request.language(), "untitled");
            inputFiles = List.of(new PasteFileRequest(derivedFilename, request.content(), request.language()));
        }

        if (inputFiles.size() > MAX_FILES_PER_PASTE) {
            throw new BadRequestException("A paste cannot contain more than " + MAX_FILES_PER_PASTE + " files.");
        }

        Set<String> seenFilenames = new HashSet<>();
        long totalBytes = 0;
        int totalLines = 0;
        List<PasteFile> pasteFiles = new ArrayList<>();

        for (int i = 0; i < inputFiles.size(); i++) {
            PasteFileRequest fileReq = inputFiles.get(i);
            if (fileReq.filename() == null || fileReq.filename().isBlank()) {
                throw new BadRequestException("File #" + (i + 1) + " must have a non-blank filename.");
            }

            String filename = fileReq.filename().trim();
            validateFilenameSecurity(filename);

            if (!seenFilenames.add(filename.toLowerCase(Locale.ROOT))) {
                throw new BadRequestException("Duplicate filename in paste: " + filename);
            }

            // A present-but-empty file is a valid zero-byte file; only a missing/null
            // content field is invalid (the legacy single-content field still rejects blanks).
            if (fileReq.content() == null) {
                throw new BadRequestException("File '" + filename + "' content must be provided.");
            }

            validateTextContent(filename, fileReq.content());

            byte[] fileBytes = fileReq.content().getBytes(StandardCharsets.UTF_8);
            if (fileBytes.length > maxContentBytes) {
                throw new PayloadTooLargeException("File '" + filename + "' exceeds the maximum allowed limit of " + maxContentBytes + " bytes.");
            }

            totalBytes += fileBytes.length;
            totalLines += countLines(fileReq.content());

            String fileLang = resolveLanguage(fileReq.language(), filename);
            PasteFile pasteFile = new PasteFile(null, filename, fileReq.content(), fileLang, i);
            pasteFiles.add(pasteFile);
        }

        if (totalBytes > maxContentBytes) {
            throw new PayloadTooLargeException("Total paste content size (" + totalBytes + " bytes) exceeds maximum limit of " + maxContentBytes + " bytes.");
        }

        // 4. Generate or validate unique public identifier
        String publicId;
        if (request.customSlug() != null && !request.customSlug().trim().isBlank()) {
            String slug = request.customSlug().trim();
            validateCustomSlug(slug);
            if (pasteRepository.existsByPublicId(slug)) {
                throw new ConflictException("The custom link '" + slug + "' is already in use. Please choose another one.");
            }
            publicId = slug;
        } else {
            publicId = generateUniquePublicId();
        }

        // 5. Deletion capability handling
        String rawCapability = null;
        String capabilityHash = null;
        if (authenticatedUserId == null) {
            rawCapability = DeletionCapabilityUtil.generateCapability();
            capabilityHash = DeletionCapabilityUtil.hashCapability(rawCapability);
        }

        // 6. Compute UTC expiration and burn-after-reading
        Instant expiresAt = request.expiration().calculateExpiresAt(Instant.now());
        boolean burnAfterReading = request.expiration().isBurnAfterReading();

        String passwordHash = null;
        if (request.password() != null && !request.password().isBlank()) {
            passwordHash = passwordEncoder.encode(request.password().trim());
        }

        // 7. Primary language & primary content for backward compatibility
        PasteFile primaryFile = pasteFiles.get(0);
        String primaryLang = (request.language() != null && !request.language().isBlank()) 
                ? request.language().toLowerCase(Locale.ROOT) 
                : primaryFile.getLanguage();

        Paste paste = new Paste(
                publicId,
                authenticatedUserId,
                request.title(),
                primaryFile.getContent(),
                primaryLang,
                request.visibility(),
                (int) totalBytes,
                totalLines,
                capabilityHash,
                expiresAt,
                burnAfterReading,
                passwordHash
        );

        // Associate all relational files
        for (PasteFile file : pasteFiles) {
            paste.addFile(file);
        }

        if (request.folderId() != null) {
            if (authenticatedUserId == null) {
                throw new ForbiddenException("Cannot assign a folder to an anonymous paste.");
            }
            Folder folder = folderRepository.findById(request.folderId())
                    .filter(f -> authenticatedUserId.equals(f.getUserId()))
                    .orElseThrow(() -> new BadRequestException("Selected folder does not exist or belong to your account."));
            paste.setFolder(folder);
        }

        String rawShareToken = null;
        if (request.visibility() == Visibility.UNLISTED) {
            rawShareToken = ShareTokenUtil.generateShareToken();
            paste.setShareAccessState(ShareAccessState.ACTIVE);
            paste.setShareTokenHash(ShareTokenUtil.hashToken(rawShareToken));
        } else {
            paste.setShareAccessState(ShareAccessState.NOT_APPLICABLE);
            paste.setShareTokenHash(null);
        }

        pasteRepository.save(paste);

        if (paste.getVisibility() == Visibility.PUBLIC) {
            eventPublisher.publishEvent(new PublicListingChangedEvent());
        }

        if (meilisearchIndexServiceProvider != null && meilisearchIndexServiceProvider.getIfAvailable() != null) {
            meilisearchIndexServiceProvider.getIfAvailable().syncPaste(paste);
        }

        return new CreatePasteResponse(
                paste.getPublicId(),
                paste.getTitle(),
                paste.getLanguage(),
                paste.getVisibility(),
                paste.getContentSizeBytes(),
                paste.getLineCount(),
                paste.getCreatedAt(),
                paste.getExpiresAt(),
                rawCapability,
                paste.isBurnAfterReading(),
                paste.isBurnAfterReading(),
                paste.isPasswordProtected(),
                null,
                rawShareToken
        );
    }

    @Transactional
    public CreatePasteResponse createEncryptedPaste(CreateEncryptedPasteRequest request, Long authenticatedUserId, String clientIp) {
        // 1. Private paste authorization requirement
        if (request.visibility() == Visibility.PRIVATE && authenticatedUserId == null) {
            throw new ForbiddenException("Creating private pastes requires an authenticated account.");
        }

        // Anti-bot honeypot check: reject if hidden bot field is populated
        if (request.website() != null && !request.website().isBlank()) {
            throw new BadRequestException("Automated submission detected.");
        }

        // 2. Rate limiting for anonymous and authenticated submissions
        if (authenticatedUserId == null) {
            rateLimiterService.checkRateLimit("create-enc:ip:" + clientIp, 30, 3600);
        } else {
            rateLimiterService.checkRateLimit("create-enc:user:" + authenticatedUserId, 120, 3600);
        }

        // 3. Validate encryption mode
        EncryptionMode mode;
        try {
            mode = EncryptionMode.valueOf(request.encryptionMode().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BadRequestException("Invalid encryption mode: " + request.encryptionMode());
        }

        // 4. Validate KDF parameters
        if (request.kdfSalt() == null || request.kdfSalt().length != 16) {
            throw new BadRequestException("KDF salt must be exactly 16 bytes.");
        }
        if (request.kdfIterations() < 600000 || request.kdfIterations() > 2000000) {
            throw new BadRequestException("KDF iterations must be between 600,000 and 2,000,000.");
        }

        // 5. Validate wrapped key according to encryption mode
        if (mode == EncryptionMode.LINK) {
            if (request.wrappedKey() != null) {
                if (request.wrappedKey().length != 60) {
                    throw new BadRequestException("Wrapped key must be exactly 60 bytes when present for LINK encryption mode.");
                }
                if (isAllZeros(request.wrappedKey(), 0, 12)) {
                    throw new BadRequestException("Wrapped key nonce must not be all zeros.");
                }
                if (isAllZeros(request.wrappedKey(), 44, 60)) {
                    throw new BadRequestException("Wrapped key auth tag must not be all zeros.");
                }
            }
        } else if (mode == EncryptionMode.PASSPHRASE) {
            if (request.wrappedKey() != null) {
                throw new BadRequestException("Wrapped key must be null for PASSPHRASE encryption mode.");
            }
        }

        // 6. Validate expiration
        if (request.expiresAt() != null && request.expiresAt().isBefore(Instant.now())) {
            throw new BadRequestException("Expiration time cannot be in the past.");
        }

        // 7. Validate files
        List<EncryptedFilePayload> files = request.files();
        if (files == null || files.isEmpty()) {
            throw new BadRequestException("Encrypted paste must contain at least one encrypted file payload.");
        }
        if (files.size() > MAX_FILES_PER_PASTE) {
            throw new BadRequestException("A paste cannot contain more than " + MAX_FILES_PER_PASTE + " files.");
        }

        Set<String> seenFilenames = new HashSet<>();
        long totalCiphertextBytes = 0;
        List<PasteFile> pasteFiles = new ArrayList<>();

        for (int i = 0; i < files.size(); i++) {
            EncryptedFilePayload f = files.get(i);
            if (f.nonce() == null || f.nonce().length != 12) {
                throw new BadRequestException("File #" + (i + 1) + " nonce must be exactly 12 bytes.");
            }
            if (f.authTag() == null || f.authTag().length != 16) {
                throw new BadRequestException("File #" + (i + 1) + " auth tag must be exactly 16 bytes.");
            }
            if (f.ciphertext() == null || f.ciphertext().length < 1 || f.ciphertext().length > maxContentBytes) {
                throw new PayloadTooLargeException("File #" + (i + 1) + " ciphertext must be between 1 byte and " + maxContentBytes + " bytes.");
            }

            String hint = (f.filenameHint() != null && !f.filenameHint().isBlank()) ? f.filenameHint().trim() : ("file-" + (i + 1) + ".enc");
            validateFilenameSecurity(hint);

            if (!seenFilenames.add(hint.toLowerCase(Locale.ROOT))) {
                throw new BadRequestException("Duplicate filename in paste: " + hint);
            }

            byte[] sha256;
            try {
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                sha256 = md.digest(f.ciphertext());
            } catch (NoSuchAlgorithmException e) {
                throw new RuntimeException("SHA-256 not available", e);
            }

            totalCiphertextBytes += f.ciphertext().length;
            String fileLang = (request.languageHint() != null && !request.languageHint().isBlank()) 
                    ? request.languageHint().toLowerCase(Locale.ROOT).trim() 
                    : resolveLanguage(null, hint);

            pasteFiles.add(new PasteFile(null, hint, f.ciphertext(), f.nonce(), f.authTag(), sha256, fileLang, i));
        }

        if (totalCiphertextBytes > (long) maxContentBytes * 10) {
            throw new PayloadTooLargeException("Total encrypted paste payload exceeds maximum permitted size.");
        }

        // 8. Generate public id & deletion capability
        String publicId = generateUniquePublicId();
        String rawCapability = null;
        String capabilityHash = null;
        if (authenticatedUserId == null) {
            rawCapability = DeletionCapabilityUtil.generateCapability();
            capabilityHash = DeletionCapabilityUtil.hashCapability(rawCapability);
        }

        String primaryLang = (request.languageHint() != null && !request.languageHint().isBlank()) 
                ? request.languageHint().toLowerCase(Locale.ROOT).trim() 
                : pasteFiles.get(0).getLanguage();

        Visibility effectiveVisibility = request.visibility() != null ? request.visibility() : Visibility.UNLISTED;
        Paste paste = new Paste(
                publicId,
                authenticatedUserId,
                null,
                primaryLang,
                effectiveVisibility,
                (int) totalCiphertextBytes,
                0,
                capabilityHash,
                request.expiresAt(),
                request.burnAfterReading(),
                mode,
                request.kdfSalt(),
                request.kdfIterations(),
                request.wrappedKey()
        );

        for (PasteFile file : pasteFiles) {
            paste.addFile(file);
        }

        String rawShareToken = null;
        if (effectiveVisibility == Visibility.UNLISTED) {
            rawShareToken = ShareTokenUtil.generateShareToken();
            paste.setShareAccessState(ShareAccessState.ACTIVE);
            paste.setShareTokenHash(ShareTokenUtil.hashToken(rawShareToken));
        } else {
            paste.setShareAccessState(ShareAccessState.NOT_APPLICABLE);
            paste.setShareTokenHash(null);
        }

        pasteRepository.save(paste);

        meterRegistry.counter("extrabin.pastes.encrypted.created", "mode", mode.name().toLowerCase(Locale.ROOT)).increment();

        return new CreatePasteResponse(
                paste.getPublicId(),
                paste.getTitle(),
                paste.getLanguage(),
                paste.getVisibility(),
                paste.getContentSizeBytes(),
                paste.getLineCount(),
                paste.getCreatedAt(),
                paste.getExpiresAt(),
                rawCapability,
                paste.isBurnAfterReading(),
                paste.isBurnAfterReading(),
                false,
                paste.getEncryptionMode(),
                rawShareToken
        );
    }

    public void recordDecryptionFailure(String publicId, String clientIp) {
        String ipKey = (clientIp != null && !clientIp.isBlank()) ? clientIp : "127.0.0.1";
        rateLimiterService.checkRateLimit("dec-fail:ip:" + ipKey, 10, 60);
        meterRegistry.counter("extrabin.pastes.encrypted.decrypt_failures").increment();
    }

    @Transactional
    public PasteViewResponse getPasteView(String publicId, Long authenticatedUserId, String providedPassword, String clientIp) {
        return getPasteView(publicId, authenticatedUserId, providedPassword, clientIp, false, null);
    }

    @Transactional
    public PasteViewResponse getPasteView(String publicId, Long authenticatedUserId, String providedPassword, String clientIp, boolean skipViewCount) {
        return getPasteView(publicId, authenticatedUserId, providedPassword, clientIp, skipViewCount, null);
    }

    @Transactional
    public PasteViewResponse getPasteView(String publicId, Long authenticatedUserId, String providedPassword, String clientIp, boolean skipViewCount, String shareToken) {
        return getPasteView(publicId, authenticatedUserId, providedPassword, clientIp, skipViewCount, shareToken, null);
    }

    @Transactional
    public PasteViewResponse getPasteView(String publicId, Long authenticatedUserId, String providedPassword, String clientIp, boolean skipViewCount, String shareToken, String unlockToken) {
        Paste paste = getActivePasteWithAuthorization(publicId, authenticatedUserId, shareToken);
        boolean isOwner = authenticatedUserId != null && authenticatedUserId.equals(paste.getUserId());
        boolean isViewOnce = paste.isBurnAfterReading();
        boolean isPasswordProtected = paste.isPasswordProtected();

        boolean unlockTokenAccepted = false;
        if (isPasswordProtected && unlockToken != null && !unlockToken.isBlank()) {
            var tokenResult = unlockTokenService.validateToken(unlockToken, publicId, clientIp);
            unlockTokenAccepted = tokenResult.isPresent();
        }

        if (isPasswordProtected && !unlockTokenAccepted) {
            if (providedPassword == null || providedPassword.isBlank()) {
                // Return masked content so password challenge modal/form can be shown
                List<PasteFileResponse> maskedFiles = (paste.getFiles() != null)
                        ? paste.getFiles().stream()
                            .map(f -> new PasteFileResponse(f.getId(), "file-" + (f.getSortOrder() + 1) + ".txt", "", f.getLanguage(), 0, 0, f.getSortOrder()))
                            .toList()
                        : Collections.emptyList();

                // Resolve user-specific vote/star state even for password-required responses
                VoteType userVotePassword = null;
                boolean isStarredPassword = false;
                if (authenticatedUserId != null) {
                    userVotePassword = pasteVoteRepository.findByPasteIdAndUserId(paste.getId(), authenticatedUserId)
                            .map(PasteVote::getVoteType).orElse(null);
                    isStarredPassword = pasteStarRepository.existsByPasteIdAndUserId(paste.getId(), authenticatedUserId);
                }

                return new PasteViewResponse(
                        paste.getPublicId(),
                        paste.getTitle(),
                        "",
                        paste.getLanguage(),
                        paste.getVisibility(),
                        paste.getContentSizeBytes(),
                        paste.getLineCount(),
                        isOwner,
                        paste.getCreatedAt(),
                        paste.getUpdatedAt(),
                        paste.getExpiresAt(),
                        paste.getVersion(),
                        isViewOnce,
                        isViewOnce,
                        true,
                        true,
                        maskedFiles,
                        paste.getViews(),
                        null, null, null, null,
                        paste.getUpvotes(),
                        paste.getDownvotes(),
                        paste.getStarsCount(),
                        userVotePassword,
                        isStarredPassword,
                        paste.getModerationState() == ModerationState.HIDDEN
                );
            }

            // Rate limit unlock attempts to prevent online brute force (SEC-01)
            String ipKey = (clientIp != null && !clientIp.isBlank()) ? clientIp : "127.0.0.1";
            rateLimiterService.checkRateLimit("unlock:ip:" + ipKey + ":paste:" + publicId, 10, 900);

            if (!passwordEncoder.matches(providedPassword.trim(), paste.getPasswordHash())) {
                throw new UnauthorizedException("Invalid password for this paste.");
            }
        }

        long currentViews;
        if (isViewOnce) {
            consumeBurnAfterReadingAtomically(paste);
            currentViews = 1L;
        } else if (skipViewCount) {
            currentViews = paste.getViews();
        } else {
            pasteRepository.incrementViews(paste.getId());
            currentViews = paste.getViews() + 1L;
            if (activityIngestionService != null && activityIngestionService.getIfAvailable() != null) {
                try {
                    activityIngestionService.getIfAvailable().recordViewEvent(paste, authenticatedUserId, clientIp);
                } catch (RuntimeException e) {
                    log.warn("Failed to record view activity for paste {}", paste.getId());
                }
            }
        }

        List<PasteFileResponse> fileResponses = resolveFileResponses(paste);

        // Resolve user-specific vote and star state for the current viewer
        VoteType userVote = null;
        boolean isStarred = false;
        if (authenticatedUserId != null) {
            userVote = pasteVoteRepository.findByPasteIdAndUserId(paste.getId(), authenticatedUserId)
                    .map(PasteVote::getVoteType).orElse(null);
            isStarred = pasteStarRepository.existsByPasteIdAndUserId(paste.getId(), authenticatedUserId);
            if (libraryService != null) {
                libraryService.recordPasteView(authenticatedUserId, paste);
            }
        }

        return new PasteViewResponse(
                paste.getPublicId(),
                paste.getTitle(),
                paste.getContent(),
                paste.getLanguage(),
                paste.getVisibility(),
                paste.getContentSizeBytes(),
                paste.getLineCount(),
                isOwner,
                paste.getCreatedAt(),
                paste.getUpdatedAt(),
                paste.getExpiresAt(),
                paste.getVersion(),
                isViewOnce,
                isViewOnce,
                isPasswordProtected,
                false,
                fileResponses,
                currentViews,
                paste.getEncryptionMode(),
                paste.getKdfSalt(),
                paste.getKdfIterations(),
                paste.getWrappedKey(),
                paste.getUpvotes(),
                paste.getDownvotes(),
                paste.getStarsCount(),
                userVote,
                isStarred,
                paste.getModerationState() == ModerationState.HIDDEN
        );
    }

    @Transactional(readOnly = true)
    public com.pastebin.paste.api.dto.EmbedPasteResponse getEmbedView(String publicId) {
        Paste paste = pasteRepository.findActiveByPublicIdWithFiles(publicId, Instant.now())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        // Server-enforced embed eligibility invariants:
        // 0. Moderation-hidden pastes are invisible everywhere: same 404 as missing pastes.
        if (paste.getModerationState() == ModerationState.HIDDEN) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        // 1. Only PUBLIC pastes can be embedded
        if (paste.getVisibility() != Visibility.PUBLIC) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        // 2. Password-protected pastes cannot be embedded
        if (paste.isPasswordProtected()) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        // 3. View-once pastes cannot be embedded (preserves view-once without accidental destruction)
        if (paste.isBurnAfterReading()) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        // 4. Encrypted pastes cannot be embedded
        if (paste.isEncrypted()) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        List<PasteFileResponse> fileResponses = resolveFileResponses(paste);

        return new com.pastebin.paste.api.dto.EmbedPasteResponse(
                paste.getPublicId(),
                paste.getTitle(),
                paste.getLanguage(),
                paste.getCreatedAt(),
                fileResponses
        );
    }

    public String getPublicBaseUrl() {
        return (publicBaseUrl != null && !publicBaseUrl.isBlank())
                ? (publicBaseUrl.endsWith("/") ? publicBaseUrl.substring(0, publicBaseUrl.length() - 1) : publicBaseUrl)
                : "http://localhost:5173";
    }

    @Transactional(readOnly = true)
    public com.pastebin.paste.api.dto.PasteMetadataHtmlResponse getPasteMetadataHtml(String publicId) {
        Paste paste = pasteRepository.findActiveByPublicId(publicId, Instant.now())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        if (paste.getModerationState() == ModerationState.HIDDEN) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        if (paste.getVisibility() != Visibility.PUBLIC) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        if (paste.isPasswordProtected()) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        if (paste.isBurnAfterReading()) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        if (paste.isEncrypted()) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        return new com.pastebin.paste.api.dto.PasteMetadataHtmlResponse(
                paste.getPublicId(),
                paste.getTitle(),
                paste.getExpiresAt()
        );
    }

    @Transactional(readOnly = true)
    public com.pastebin.paste.api.dto.ShareDescriptorResponse getShareDescriptor(
            String publicId, Long authenticatedUserId, String providedPassword, String clientIp, String shareToken, String unlockToken) {
        Paste paste = authorizePasteAccess(publicId, authenticatedUserId, shareToken, providedPassword, clientIp, unlockToken, false);

        String base = (publicBaseUrl != null && !publicBaseUrl.isBlank())
                ? (publicBaseUrl.endsWith("/") ? publicBaseUrl.substring(0, publicBaseUrl.length() - 1) : publicBaseUrl)
                : "http://localhost:5173";

        String canonicalUrl = base + "/p/" + paste.getPublicId();
        if (paste.getVisibility() == Visibility.UNLISTED && shareToken != null && !shareToken.isBlank()) {
            canonicalUrl = canonicalUrl + "?token=" + shareToken;
        }

        String rawUrl = base + "/api/v1/pastes/" + paste.getPublicId() + "/raw";
        String downloadUrl = base + "/api/v1/pastes/" + paste.getPublicId() + "/download";
        String zipDownloadUrl = base + "/api/v1/pastes/" + paste.getPublicId() + "/download-zip";
        String embedUrl = base + "/embed/" + paste.getPublicId();

        String shareStatus = (paste.getVisibility() == Visibility.UNLISTED)
                ? (paste.getShareAccessState() != null ? paste.getShareAccessState().name() : "ACTIVE")
                : "NOT_APPLICABLE";

        boolean ogEligible = paste.getVisibility() == Visibility.PUBLIC
                && !paste.isPasswordProtected()
                && !paste.isBurnAfterReading()
                && !paste.isEncrypted()
                && paste.getModerationState() != ModerationState.HIDDEN;

        return new com.pastebin.paste.api.dto.ShareDescriptorResponse(
                paste.getPublicId(),
                canonicalUrl,
                rawUrl,
                downloadUrl,
                zipDownloadUrl,
                embedUrl,
                paste.getVisibility().name(),
                shareStatus,
                paste.isPasswordProtected(),
                ogEligible
        );
    }

    @Transactional
    public PasteViewResponse getPasteView(String publicId, Long authenticatedUserId, String providedPassword) {
        return getPasteView(publicId, authenticatedUserId, providedPassword, "127.0.0.1");
    }

    @Transactional
    public PasteViewResponse getPasteView(String publicId, Long authenticatedUserId) {
        return getPasteView(publicId, authenticatedUserId, null, "127.0.0.1");
    }

    public record RawPayload(byte[] bytes, EncryptionMode encryptionMode, String filename) {}

    @Transactional
    public RawPayload getRawPayload(String publicId, Long authenticatedUserId, String providedPassword, String clientIp) {
        return getRawPayload(publicId, authenticatedUserId, providedPassword, clientIp, null);
    }

    @Transactional
    public RawPayload getRawPayload(String publicId, Long authenticatedUserId, String providedPassword, String clientIp, String shareToken) {
        return getRawPayload(publicId, authenticatedUserId, providedPassword, clientIp, shareToken, null);
    }

    @Transactional
    public RawPayload getRawPayload(String publicId, Long authenticatedUserId, String providedPassword, String clientIp, String shareToken, String unlockToken) {
        Paste paste = authorizePasteAccess(publicId, authenticatedUserId, shareToken, providedPassword, clientIp, unlockToken);
        if (paste.isBurnAfterReading()) {
            consumeBurnAfterReadingAtomically(paste);
        }

        if (paste.isEncrypted()) {
            byte[] bytes = buildEncryptedBundleJson(paste);
            String filename = sanitizeFilename(paste.getTitle(), paste.getPublicId()) + "-encrypted.json";
            return new RawPayload(bytes, paste.getEncryptionMode(), filename);
        }

        byte[] bytes = paste.getContent() != null ? paste.getContent().getBytes(StandardCharsets.UTF_8) : new byte[0];
        String filename = deriveFilename(paste.getTitle(), paste.getLanguage(), paste.getPublicId());
        return new RawPayload(bytes, null, filename);
    }

    @Transactional
    public RawPayload getRawFilePayload(String publicId, String filename, Long authenticatedUserId, String providedPassword, String clientIp) {
        return getRawFilePayload(publicId, filename, authenticatedUserId, providedPassword, clientIp, null);
    }

    @Transactional
    public RawPayload getRawFilePayload(String publicId, String filename, Long authenticatedUserId, String providedPassword, String clientIp, String shareToken) {
        return getRawFilePayload(publicId, filename, authenticatedUserId, providedPassword, clientIp, shareToken, null);
    }

    @Transactional
    public RawPayload getRawFilePayload(String publicId, String filename, Long authenticatedUserId, String providedPassword, String clientIp, String shareToken, String unlockToken) {
        Paste paste = authorizePasteAccess(publicId, authenticatedUserId, shareToken, providedPassword, clientIp, unlockToken);
        if (paste.isBurnAfterReading()) {
            consumeBurnAfterReadingAtomically(paste);
        }

        PasteFile file = findFileOrThrow(paste, filename);
        if (paste.isEncrypted()) {
            return new RawPayload(file.getCiphertext(), paste.getEncryptionMode(), file.getFilename());
        }
        byte[] bytes = file.getContent() != null ? file.getContent().getBytes(StandardCharsets.UTF_8) : new byte[0];
        return new RawPayload(bytes, null, file.getFilename());
    }

    @Transactional
    public RawPayload getRawFilePayloadById(String publicId, Long fileId, Long authenticatedUserId, String providedPassword, String clientIp, String shareToken) {
        return getRawFilePayloadById(publicId, fileId, authenticatedUserId, providedPassword, clientIp, shareToken, null);
    }

    @Transactional
    public RawPayload getRawFilePayloadById(String publicId, Long fileId, Long authenticatedUserId, String providedPassword, String clientIp, String shareToken, String unlockToken) {
        Paste paste = authorizePasteAccess(publicId, authenticatedUserId, shareToken, providedPassword, clientIp, unlockToken);
        if (paste.isBurnAfterReading()) {
            consumeBurnAfterReadingAtomically(paste);
        }

        PasteFile file = findFileByIdOrThrow(paste, fileId);
        if (paste.isEncrypted()) {
            return new RawPayload(file.getCiphertext(), paste.getEncryptionMode(), file.getFilename());
        }
        byte[] bytes = file.getContent() != null ? file.getContent().getBytes(StandardCharsets.UTF_8) : new byte[0];
        return new RawPayload(bytes, null, file.getFilename());
    }

    @Transactional
    public String getRawContent(String publicId, Long authenticatedUserId, String providedPassword, String clientIp) {
        RawPayload payload = getRawPayload(publicId, authenticatedUserId, providedPassword, clientIp);
        if (payload.encryptionMode() != null) {
            return Base64.getEncoder().encodeToString(payload.bytes());
        }
        return new String(payload.bytes(), StandardCharsets.UTF_8);
    }

    @Transactional
    public String getRawContent(String publicId, Long authenticatedUserId, String providedPassword) {
        return getRawContent(publicId, authenticatedUserId, providedPassword, "127.0.0.1");
    }

    @Transactional
    public String getRawContent(String publicId, Long authenticatedUserId) {
        return getRawContent(publicId, authenticatedUserId, null, "127.0.0.1");
    }

    public record TypedPastePayload(
            byte[] contentBytes,
            String etag,
            String cacheControl,
            boolean notModified
    ) {}

    @Transactional
    public TypedPastePayload getTypedPaste(
            String publicId,
            String ifNoneMatch,
            Long authenticatedUserId,
            String providedPassword,
            String clientIp
    ) {
        return getTypedPaste(publicId, ifNoneMatch, authenticatedUserId, providedPassword, clientIp, null);
    }

    @Transactional
    public TypedPastePayload getTypedPaste(
            String publicId,
            String ifNoneMatch,
            Long authenticatedUserId,
            String providedPassword,
            String clientIp,
            String shareToken
    ) {
        return getTypedPaste(publicId, ifNoneMatch, authenticatedUserId, providedPassword, clientIp, shareToken, null);
    }

    @Transactional
    public TypedPastePayload getTypedPaste(
            String publicId,
            String ifNoneMatch,
            Long authenticatedUserId,
            String providedPassword,
            String clientIp,
            String shareToken,
            String unlockToken
    ) {
        Paste paste = authorizePasteAccess(publicId, authenticatedUserId, shareToken, providedPassword, clientIp, unlockToken);

        if (paste.isEncrypted()) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        byte[] contentBytes = paste.getContent() != null ? paste.getContent().getBytes(StandardCharsets.UTF_8) : new byte[0];

        String etag;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(contentBytes);
            etag = "\"" + Base64.getUrlEncoder().withoutPadding().encodeToString(digest) + "\"";
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not supported", e);
        }

        String cacheControl;
        if (paste.isBurnAfterReading()) {
            cacheControl = "private, no-cache, no-store, must-revalidate";
        } else if (authenticatedUserId != null || paste.getVisibility() == Visibility.PRIVATE || paste.isPasswordProtected()) {
            cacheControl = "private, no-store";
        } else if (paste.getVisibility() == Visibility.UNLISTED) {
            cacheControl = "private, no-cache";
        } else {
            cacheControl = "public, max-age=300, must-revalidate";
        }

        if (paste.isBurnAfterReading()) {
            consumeBurnAfterReadingAtomically(paste);
            return new TypedPastePayload(contentBytes, etag, cacheControl, false);
        }

        boolean isMatch = false;
        if (ifNoneMatch != null && !ifNoneMatch.isBlank()) {
            String trimmed = ifNoneMatch.trim();
            if ("*".equals(trimmed) || trimmed.equals(etag)) {
                isMatch = true;
            } else {
                for (String part : trimmed.split(",")) {
                    String candidate = part.trim();
                    if (candidate.equals(etag) || candidate.equals("W/" + etag)) {
                        isMatch = true;
                        break;
                    }
                }
            }
        }

        if (isMatch) {
            return new TypedPastePayload(new byte[0], etag, cacheControl, true);
        }

        return new TypedPastePayload(contentBytes, etag, cacheControl, false);
    }

    @Transactional
    public DownloadData getDownloadData(String publicId, Long authenticatedUserId, String providedPassword, String clientIp) {
        return getDownloadData(publicId, authenticatedUserId, providedPassword, clientIp, null);
    }

    @Transactional
    public DownloadData getDownloadData(String publicId, Long authenticatedUserId, String providedPassword, String clientIp, String shareToken) {
        return getDownloadData(publicId, authenticatedUserId, providedPassword, clientIp, shareToken, null);
    }

    @Transactional
    public DownloadData getDownloadData(String publicId, Long authenticatedUserId, String providedPassword, String clientIp, String shareToken, String unlockToken) {
        Paste paste = authorizePasteAccess(publicId, authenticatedUserId, shareToken, providedPassword, clientIp, unlockToken);
        if (paste.isBurnAfterReading()) {
            consumeBurnAfterReadingAtomically(paste);
        }

        if (paste.isEncrypted()) {
            byte[] bytes = buildEncryptedBundleJson(paste);
            String rawTitle = (paste.getTitle() != null && !paste.getTitle().isBlank())
                    ? paste.getTitle() + "-encrypted.json"
                    : "paste-" + paste.getPublicId() + "-encrypted.json";
            String filename = FilenameSanitizer.sanitizeForDownload(rawTitle, paste.getPublicId());
            return new DownloadData(filename, bytes, paste.getEncryptionMode());
        }

        // If single file in files table, sanitize and return its filename
        if (paste.getFiles() != null && paste.getFiles().size() == 1) {
            PasteFile single = paste.getFiles().get(0);
            String safeName = FilenameSanitizer.sanitizeForDownload(single.getFilename(), paste.getPublicId());
            return new DownloadData(safeName, single.getContent());
        }

        String extension = resolveExtension(paste.getLanguage());
        String safeBase = FilenameSanitizer.sanitizeForDownload(paste.getTitle(), paste.getPublicId());
        String filename = safeBase.contains(".") ? safeBase : safeBase + "." + extension;

        return new DownloadData(filename, paste.getContent());
    }

    @Transactional
    public DownloadData getDownloadData(String publicId, Long authenticatedUserId, String providedPassword) {
        return getDownloadData(publicId, authenticatedUserId, providedPassword, "127.0.0.1", null);
    }

    @Transactional
    public DownloadData getDownloadData(String publicId, Long authenticatedUserId) {
        return getDownloadData(publicId, authenticatedUserId, null, "127.0.0.1", null);
    }

    @Transactional
    public DownloadData getDownloadFileData(String publicId, String filename, Long authenticatedUserId, String providedPassword, String clientIp) {
        return getDownloadFileData(publicId, filename, authenticatedUserId, providedPassword, clientIp, null);
    }

    @Transactional
    public DownloadData getDownloadFileData(String publicId, String filename, Long authenticatedUserId, String providedPassword, String clientIp, String shareToken) {
        return getDownloadFileData(publicId, filename, authenticatedUserId, providedPassword, clientIp, shareToken, null);
    }

    @Transactional
    public DownloadData getDownloadFileData(String publicId, String filename, Long authenticatedUserId, String providedPassword, String clientIp, String shareToken, String unlockToken) {
        Paste paste = authorizePasteAccess(publicId, authenticatedUserId, shareToken, providedPassword, clientIp, unlockToken);
        if (paste.isBurnAfterReading()) {
            consumeBurnAfterReadingAtomically(paste);
        }

        PasteFile file = findFileOrThrow(paste, filename);
        String safeName = FilenameSanitizer.sanitizeForDownload(file.getFilename(), paste.getPublicId());
        if (paste.isEncrypted()) {
            return new DownloadData(safeName, file.getCiphertext(), paste.getEncryptionMode());
        }
        return new DownloadData(safeName, file.getContent());
    }

    @Transactional
    public DownloadData getDownloadFileDataById(String publicId, Long fileId, Long authenticatedUserId, String providedPassword, String clientIp, String shareToken) {
        return getDownloadFileDataById(publicId, fileId, authenticatedUserId, providedPassword, clientIp, shareToken, null);
    }

    @Transactional
    public DownloadData getDownloadFileDataById(String publicId, Long fileId, Long authenticatedUserId, String providedPassword, String clientIp, String shareToken, String unlockToken) {
        Paste paste = authorizePasteAccess(publicId, authenticatedUserId, shareToken, providedPassword, clientIp, unlockToken);
        if (paste.isBurnAfterReading()) {
            consumeBurnAfterReadingAtomically(paste);
        }

        PasteFile file = findFileByIdOrThrow(paste, fileId);
        String safeName = FilenameSanitizer.sanitizeForDownload(file.getFilename(), paste.getPublicId());
        if (paste.isEncrypted()) {
            return new DownloadData(safeName, file.getCiphertext(), paste.getEncryptionMode());
        }
        return new DownloadData(safeName, file.getContent());
    }

    @Transactional
    public ZipDownloadData getZipDownloadData(String publicId, Long authenticatedUserId, String providedPassword, String clientIp) {
        return getZipDownloadData(publicId, authenticatedUserId, providedPassword, clientIp, null);
    }

    @Transactional
    public ZipDownloadData getZipDownloadData(String publicId, Long authenticatedUserId, String providedPassword, String clientIp, String shareToken) {
        return getZipDownloadData(publicId, authenticatedUserId, providedPassword, clientIp, shareToken, null);
    }

    @Transactional
    public ZipDownloadData getZipDownloadData(String publicId, Long authenticatedUserId, String providedPassword, String clientIp, String shareToken, String unlockToken) {
        Paste paste = authorizePasteAccess(publicId, authenticatedUserId, shareToken, providedPassword, clientIp, unlockToken);
        if (paste.isBurnAfterReading()) {
            consumeBurnAfterReadingAtomically(paste);
        }

        List<PasteFile> files = paste.getFiles();
        if (files == null || files.isEmpty()) {
            String singleName = deriveFilename(paste.getTitle(), paste.getLanguage(), paste.getPublicId());
            files = List.of(new PasteFile(paste, singleName, paste.getContent(), paste.getLanguage(), 0));
        }

        // 1. Entry count cap check
        if (files.size() > archiveMaxEntries) {
            throw new ArchiveLimitException("Archive entry count " + files.size() + " exceeds the limit of " + archiveMaxEntries + ".");
        }

        // 2. Uncompressed byte cap check (overflow-safe)
        long totalUncompressedBytes = 0L;
        for (PasteFile file : files) {
            long fileSize;
            if (paste.isEncrypted()) {
                int nonceLen = file.getNonce() != null ? file.getNonce().length : 0;
                int ctLen = file.getCiphertext() != null ? file.getCiphertext().length : 0;
                int tagLen = file.getAuthTag() != null ? file.getAuthTag().length : 0;
                fileSize = (long) nonceLen + ctLen + tagLen;
            } else {
                if (file.getCiphertext() != null) {
                    fileSize = file.getCiphertext().length;
                } else if (file.getContent() != null) {
                    fileSize = file.getContent().getBytes(StandardCharsets.UTF_8).length;
                } else {
                    fileSize = 0L;
                }
            }
            try {
                totalUncompressedBytes = Math.addExact(totalUncompressedBytes, fileSize);
            } catch (ArithmeticException ex) {
                throw new ArchiveLimitException("Archive uncompressed size exceeds limit.");
            }
            if (totalUncompressedBytes > archiveMaxBytes) {
                throw new ArchiveLimitException("Archive uncompressed size " + totalUncompressedBytes + " exceeds limit of " + archiveMaxBytes + " bytes.");
            }
        }

        String safeBase = FilenameSanitizer.sanitizeForDownload(paste.getTitle(), paste.getPublicId());
        String zipFilename = safeBase + ".zip";

        // Bounded counting output stream to enforce archiveMaxOutputBytes including finalization
        final long maxOutBytes = this.archiveMaxOutputBytes;
        class BoundedOutputStream extends java.io.OutputStream {
            private final java.io.OutputStream delegate;
            private long count = 0L;

            BoundedOutputStream(java.io.OutputStream delegate) {
                this.delegate = delegate;
            }

            @Override
            public void write(int b) throws IOException {
                if (count + 1 > maxOutBytes) {
                    throw new ArchiveLimitException("Archive compressed output exceeds limit of " + maxOutBytes + " bytes.");
                }
                delegate.write(b);
                count++;
            }

            @Override
            public void write(byte[] b, int off, int len) throws IOException {
                if (b == null) {
                    throw new NullPointerException();
                }
                if (count + len > maxOutBytes) {
                    throw new ArchiveLimitException("Archive compressed output exceeds limit of " + maxOutBytes + " bytes.");
                }
                delegate.write(b, off, len);
                count += len;
            }

            @Override
            public void flush() throws IOException {
                delegate.flush();
            }

            @Override
            public void close() throws IOException {
                delegate.close();
            }
        }

        if (paste.isEncrypted()) {
            List<String> rawNames = files.stream().map(PasteFile::getFilename).toList();
            List<String> dedupedNames = FilenameSanitizer.sanitizeAndDeduplicateForZip(rawNames);

            java.io.File tempFile = null;
            try {
                tempFile = java.io.File.createTempFile("extra-bin-enc-zip-", ".tmp");
                try (java.io.FileOutputStream fos = new java.io.FileOutputStream(tempFile);
                     BoundedOutputStream bos = new BoundedOutputStream(fos);
                     ZipOutputStream zos = new ZipOutputStream(bos, StandardCharsets.UTF_8)) {

                    // 1. Build and write manifest.json
                    Map<String, Object> manifest = new LinkedHashMap<>();
                    manifest.put("format", "extra:enc-zip:v1");
                    manifest.put("pasteId", paste.getPublicId());
                    manifest.put("encryptionMode", paste.getEncryptionMode().name());
                    manifest.put("kdfSalt", Base64.getEncoder().encodeToString(paste.getKdfSalt() != null ? paste.getKdfSalt() : new byte[0]));
                    manifest.put("kdfIterations", paste.getKdfIterations());
                    manifest.put("wrappedKey", paste.getWrappedKey() != null ? Base64.getEncoder().encodeToString(paste.getWrappedKey()) : null);

                    List<Map<String, Object>> manifestFiles = new ArrayList<>();
                    for (int i = 0; i < files.size(); i++) {
                        PasteFile file = files.get(i);
                        String safeName = dedupedNames.get(i);
                        String encEntryName = safeName + ".enc";

                        Map<String, Object> fileEntry = new LinkedHashMap<>();
                        fileEntry.put("filename", encEntryName);
                        fileEntry.put("originalFilename", safeName);
                        fileEntry.put("nonce", Base64.getEncoder().encodeToString(file.getNonce() != null ? file.getNonce() : new byte[0]));
                        fileEntry.put("authTag", Base64.getEncoder().encodeToString(file.getAuthTag() != null ? file.getAuthTag() : new byte[0]));
                        int ctLen = file.getCiphertext() != null ? file.getCiphertext().length : 0;
                        fileEntry.put("ciphertextLength", ctLen);
                        manifestFiles.add(fileEntry);
                    }
                    manifest.put("files", manifestFiles);

                    ZipEntry manifestEntry = new ZipEntry("manifest.json");
                    zos.putNextEntry(manifestEntry);
                    zos.write(objectMapper.writeValueAsBytes(manifest));
                    zos.closeEntry();

                    // 2. Write each .enc file containing nonce || ciphertext || authTag
                    for (int i = 0; i < files.size(); i++) {
                        PasteFile file = files.get(i);
                        String safeName = dedupedNames.get(i);
                        String encEntryName = safeName + ".enc";

                        ZipEntry entry = new ZipEntry(encEntryName);
                        zos.putNextEntry(entry);
                        byte[] nonce = file.getNonce() != null ? file.getNonce() : new byte[0];
                        byte[] ct = file.getCiphertext() != null ? file.getCiphertext() : new byte[0];
                        byte[] tag = file.getAuthTag() != null ? file.getAuthTag() : new byte[0];

                        byte[] entryPayload = new byte[nonce.length + ct.length + tag.length];
                        System.arraycopy(nonce, 0, entryPayload, 0, nonce.length);
                        System.arraycopy(ct, 0, entryPayload, nonce.length, ct.length);
                        System.arraycopy(tag, 0, entryPayload, nonce.length + ct.length, tag.length);

                        zos.write(entryPayload);
                        zos.closeEntry();
                    }
                    zos.finish();
                }

                byte[] zipBytes = java.nio.file.Files.readAllBytes(tempFile.toPath());
                return new ZipDownloadData(zipFilename, zipBytes);
            } catch (ArchiveLimitException e) {
                throw e;
            } catch (IOException e) {
                throw new RuntimeException("Failed to generate encrypted ZIP archive for paste", e);
            } finally {
                if (tempFile != null && tempFile.exists()) {
                    tempFile.delete();
                }
            }
        }

        List<String> rawNames = files.stream().map(PasteFile::getFilename).toList();
        List<String> dedupedNames = FilenameSanitizer.sanitizeAndDeduplicateForZip(rawNames);

        java.io.File tempFile = null;
        try {
            tempFile = java.io.File.createTempFile("extra-bin-zip-", ".tmp");
            try (java.io.FileOutputStream fos = new java.io.FileOutputStream(tempFile);
                 BoundedOutputStream bos = new BoundedOutputStream(fos);
                 ZipOutputStream zos = new ZipOutputStream(bos, StandardCharsets.UTF_8)) {

                for (int i = 0; i < files.size(); i++) {
                    PasteFile file = files.get(i);
                    String safeName = dedupedNames.get(i);

                    ZipEntry entry = new ZipEntry(safeName);
                    zos.putNextEntry(entry);
                    byte[] payload = file.getCiphertext() != null
                            ? file.getCiphertext()
                            : (file.getContent() != null ? file.getContent().getBytes(StandardCharsets.UTF_8) : new byte[0]);
                    zos.write(payload);
                    zos.closeEntry();
                }
                zos.finish();
            }

            byte[] zipBytes = java.nio.file.Files.readAllBytes(tempFile.toPath());
            return new ZipDownloadData(zipFilename, zipBytes);
        } catch (ArchiveLimitException e) {
            throw e;
        } catch (IOException e) {
            throw new RuntimeException("Failed to generate ZIP archive for paste", e);
        } finally {
            if (tempFile != null && tempFile.exists()) {
                tempFile.delete();
            }
        }
    }

    private boolean isAllZeros(byte[] bytes, int start, int end) {
        if (bytes == null) return false;
        for (int i = start; i < end && i < bytes.length; i++) {
            if (bytes[i] != 0) {
                return false;
            }
        }
        return true;
    }

    @Transactional(readOnly = true)
    public List<com.pastebin.paste.api.dto.PasteSummaryResponse> getStarredPastes(Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required.");
        }

        List<PasteStar> stars = pasteStarRepository.findByUserId(userId);
        if (stars.isEmpty()) {
            return List.of();
        }

        List<Paste> pastes = stars.stream()
                .map(PasteStar::getPaste)
                .filter(p -> p.getExpiresAt() == null || p.getExpiresAt().isAfter(Instant.now()))
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .toList();

        return pastes.stream()
                .map(p -> new com.pastebin.paste.api.dto.PasteSummaryResponse(
                        p.getPublicId(),
                        p.getTitle(),
                        p.getLanguage(),
                        p.getVisibility(),
                        p.getContentSizeBytes(),
                        p.getLineCount(),
                        p.getCreatedAt(),
                        p.getExpiresAt(),
                        p.getVersion(),
                        p.getViews(),
                        p.getFolder() != null ? p.getFolder().getId() : null,
                        p.getFolder() != null ? p.getFolder().getName() : null
                ))
                .toList();
    }

    private byte[] buildEncryptedBundleJson(Paste paste) {
        try {
            Map<String, Object> bundle = new LinkedHashMap<>();
            bundle.put("format", "extra:enc-bundle:v1");
            bundle.put("pasteId", paste.getPublicId());
            bundle.put("encryptionMode", paste.getEncryptionMode().name());
            bundle.put("kdfSalt", Base64.getEncoder().encodeToString(paste.getKdfSalt() != null ? paste.getKdfSalt() : new byte[0]));
            bundle.put("kdfIterations", paste.getKdfIterations());
            bundle.put("wrappedKey", paste.getWrappedKey() != null ? Base64.getEncoder().encodeToString(paste.getWrappedKey()) : null);

            List<Map<String, Object>> files = new ArrayList<>();
            if (paste.getFiles() != null) {
                for (PasteFile f : paste.getFiles()) {
                    Map<String, Object> fileMap = new LinkedHashMap<>();
                    fileMap.put("filename", f.getFilename());
                    fileMap.put("nonce", Base64.getEncoder().encodeToString(f.getNonce() != null ? f.getNonce() : new byte[0]));
                    fileMap.put("ciphertext", Base64.getEncoder().encodeToString(f.getCiphertext() != null ? f.getCiphertext() : new byte[0]));
                    fileMap.put("authTag", Base64.getEncoder().encodeToString(f.getAuthTag() != null ? f.getAuthTag() : new byte[0]));
                    files.add(fileMap);
                }
            }
            bundle.put("files", files);
            return objectMapper.writeValueAsBytes(bundle);
        } catch (Exception e) {
            throw new RuntimeException("Failed to serialize encrypted paste bundle", e);
        }
    }

    @Transactional
    public void deleteAnonymousPaste(String publicId, String deletionCapability, String clientIp) {
        rateLimiterService.checkRateLimit("del_attempt:ip:" + clientIp, 5, 900);

        Paste paste = pasteRepository.findActiveByPublicIdWithFiles(publicId, Instant.now())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        if (!paste.isAnonymous() || paste.getDeletionCapabilityHash() == null) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        if (!DeletionCapabilityUtil.verifyCapability(deletionCapability, paste.getDeletionCapabilityHash())) {
            throw new ForbiddenException("Invalid deletion capability.");
        }

        pasteRepository.delete(paste);
        if (paste.getVisibility() == Visibility.PUBLIC) {
            eventPublisher.publishEvent(new PublicListingChangedEvent());
        }
        if (meilisearchIndexServiceProvider != null && meilisearchIndexServiceProvider.getIfAvailable() != null) {
            meilisearchIndexServiceProvider.getIfAvailable().deletePaste(publicId);
        }
    }

    @Transactional
    public String updatePasteSlug(String currentPublicId, String newSlug, String deletionCapability, Long authenticatedUserId, String clientIp) {
        if (newSlug == null || newSlug.trim().isBlank()) {
            throw new BadRequestException("New link name must not be blank.");
        }
        String cleanSlug = newSlug.trim();
        validateCustomSlug(cleanSlug);

        if (cleanSlug.equals(currentPublicId)) {
            return currentPublicId;
        }

        if (pasteRepository.existsByPublicId(cleanSlug)) {
            throw new ConflictException("The custom link '" + cleanSlug + "' is already in use. Please choose another one.");
        }

        Paste paste = pasteRepository.findActiveByPublicId(currentPublicId, Instant.now())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        if (paste.isAnonymous()) {
            if (deletionCapability == null || paste.getDeletionCapabilityHash() == null ||
                    !DeletionCapabilityUtil.verifyCapability(deletionCapability, paste.getDeletionCapabilityHash())) {
                throw new ForbiddenException("Invalid or missing deletion secret capability.");
            }
        } else {
            if (authenticatedUserId == null || !paste.getUserId().equals(authenticatedUserId)) {
                throw new ForbiddenException("You do not have permission to edit this paste's URL.");
            }
        }

        paste.setPublicId(cleanSlug);
        pasteRepository.save(paste);
        if (paste.getVisibility() == Visibility.PUBLIC) {
            eventPublisher.publishEvent(new PublicListingChangedEvent());
        }
        return cleanSlug;
    }

    @Transactional
    public void revokeLink(String publicId, String deletionCapability, Long authenticatedUserId, String clientIp) {
        Paste paste = pasteRepository.findActiveByPublicIdForUpdate(publicId, Instant.now())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        if (paste.getVisibility() != Visibility.UNLISTED) {
            throw new BadRequestException("Link revocation is only applicable to unlisted pastes.");
        }

        // Authorize owner: account owner OR anonymous deletion capability
        if (paste.isAnonymous()) {
            if (deletionCapability == null || paste.getDeletionCapabilityHash() == null ||
                    !DeletionCapabilityUtil.verifyCapability(deletionCapability, paste.getDeletionCapabilityHash())) {
                throw new ForbiddenException("Invalid or missing deletion secret capability.");
            }
        } else {
            if (authenticatedUserId == null || !paste.getUserId().equals(authenticatedUserId)) {
                throw new ForbiddenException("You do not have permission to revoke this paste's link.");
            }
        }

        // Idempotent revocation transition
        if (paste.getShareAccessState() != ShareAccessState.REVOKED) {
            paste.setShareAccessState(ShareAccessState.REVOKED);
            paste.setShareTokenHash(null);
            paste.setLinkRevokedAt(Instant.now());
            pasteRepository.save(paste);
        }
    }

    @Transactional
    public String rotateLink(String publicId, String deletionCapability, Long authenticatedUserId, String clientIp) {
        Paste paste = pasteRepository.findActiveByPublicIdForUpdate(publicId, Instant.now())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        if (paste.getVisibility() != Visibility.UNLISTED) {
            throw new BadRequestException("Link rotation is only applicable to unlisted pastes.");
        }

        // Authorize owner: account owner OR anonymous deletion capability
        if (paste.isAnonymous()) {
            if (deletionCapability == null || paste.getDeletionCapabilityHash() == null ||
                    !DeletionCapabilityUtil.verifyCapability(deletionCapability, paste.getDeletionCapabilityHash())) {
                throw new ForbiddenException("Invalid or missing deletion secret capability.");
            }
        } else {
            if (authenticatedUserId == null || !paste.getUserId().equals(authenticatedUserId)) {
                throw new ForbiddenException("You do not have permission to rotate this paste's link.");
            }
        }

        String freshToken = ShareTokenUtil.generateShareToken();
        paste.setShareAccessState(ShareAccessState.ACTIVE);
        paste.setShareTokenHash(ShareTokenUtil.hashToken(freshToken));
        paste.setLinkRevokedAt(null);
        pasteRepository.save(paste);

        return freshToken;
    }

    private void verifyPasswordAccess(Paste paste, String providedPassword, String clientIp, String publicId) {
        if (paste.isPasswordProtected()) {
            String ipKey = (clientIp != null && !clientIp.isBlank()) ? clientIp : "127.0.0.1";
            rateLimiterService.checkRateLimit("unlock:ip:" + ipKey + ":paste:" + publicId, 10, 900);
            if (providedPassword == null || providedPassword.isBlank()) {
                throw new ResourceNotFoundException("Paste not found or has expired.");
            }
            if (!passwordEncoder.matches(providedPassword.trim(), paste.getPasswordHash())) {
                throw new UnauthorizedException("Invalid password for this paste.");
            }
        }
    }

    private Paste authorizePasteAccess(String publicId, Long authenticatedUserId, String shareToken,
                                        String providedPassword, String clientIp, String unlockToken) {
        return authorizePasteAccess(publicId, authenticatedUserId, shareToken, providedPassword, clientIp, unlockToken, true);
    }

    private Paste authorizePasteAccess(String publicId, Long authenticatedUserId, String shareToken,
                                        String providedPassword, String clientIp, String unlockToken, boolean forUpdate) {
        Paste paste = getActivePasteWithAuthorization(publicId, authenticatedUserId, shareToken, forUpdate);

        if (paste.isPasswordProtected() && unlockToken != null && !unlockToken.isBlank()) {
            Optional<UnlockTokenService.UnlockTokenPayload> payload =
                    unlockTokenService.validateToken(unlockToken, publicId, clientIp);
            if (payload.isPresent()) {
                return paste;
            }
        }

        verifyPasswordAccess(paste, providedPassword, clientIp, publicId);
        return paste;
    }

    public record UnlockGrant(String unlockToken, Instant expiresAt) {}

    @Transactional(readOnly = true)
    public UnlockGrant unlockPaste(String publicId, String providedPassword, String clientIp) {
        Paste paste = pasteRepository.findActiveByPublicId(publicId, Instant.now())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        if (!paste.isPasswordProtected()) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        String ipKey = (clientIp != null && !clientIp.isBlank()) ? clientIp : "127.0.0.1";
        rateLimiterService.checkRateLimit("unlock:ip:" + ipKey + ":paste:" + publicId, 10, 900);

        if (providedPassword == null || providedPassword.isBlank()) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        if (!passwordEncoder.matches(providedPassword.trim(), paste.getPasswordHash())) {
            throw new UnauthorizedException("Invalid password for this paste.");
        }

        UnlockTokenService.GeneratedToken generated = unlockTokenService.generateToken(publicId, clientIp);
        return new UnlockGrant(generated.token(), generated.expiresAt());
    }

    /**
     * Shared access gate for auxiliary paste surfaces (currently the paste-comments API).
     * Enforces the identical authorization contract as the content endpoints:
     * active-paste lookup (404 when absent/expired; 404 for PRIVATE pastes to non-owners)
     * followed by paste-password verification (401 when the password is missing or wrong).
     *
     * @return the authorized paste; callers may still apply their own product-level rules
     *         (e.g. comments being restricted to PUBLIC pastes) on the returned entity.
     */
    public Paste getActivePasteWithAccess(String publicId, Long authenticatedUserId, String providedPassword, String clientIp) {
        return getActivePasteWithAccess(publicId, authenticatedUserId, providedPassword, clientIp, null);
    }

    public Paste getActivePasteWithAccess(String publicId, Long authenticatedUserId, String providedPassword, String clientIp, String shareToken) {
        Paste paste = getActivePasteWithAuthorization(publicId, authenticatedUserId, shareToken, false);
        verifyPasswordAccess(paste, providedPassword, clientIp, publicId);
        return paste;
    }

    private Paste getActivePasteWithAuthorization(String publicId, Long authenticatedUserId) {
        return getActivePasteWithAuthorization(publicId, authenticatedUserId, null, true);
    }

    private Paste getActivePasteWithAuthorization(String publicId, Long authenticatedUserId, String shareToken) {
        return getActivePasteWithAuthorization(publicId, authenticatedUserId, shareToken, true);
    }

    private Paste getActivePasteWithAuthorization(String publicId, Long authenticatedUserId, String shareToken, boolean forUpdate) {
        Paste candidate = pasteRepository.findActiveByPublicIdWithFiles(publicId, Instant.now())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        // If burn-after-reading is active and write lock is requested, acquire pessimistic write lock to serialize concurrent access
        Paste paste;
        if (candidate.isBurnAfterReading() && forUpdate) {
            paste = pasteRepository.findActiveByPublicIdForUpdate(publicId, Instant.now())
                    .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));
        } else {
            paste = candidate;
        }

        boolean isOwner = authenticatedUserId != null && authenticatedUserId.equals(paste.getUserId());

        // Moderation gate: HIDDEN pastes must be indistinguishable from missing ones for non-owners
        // (same 404 ProblemDetails as expired/missing), while the owner retains read access and the
        // response carries the moderationHidden flag.
        if (paste.getModerationState() == ModerationState.HIDDEN && !isOwner) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        // If PRIVATE, enforce owner access. Return 404 to avoid leaking paste existence.
        if (paste.getVisibility() == Visibility.PRIVATE) {
            if (!isOwner) {
                throw new ResourceNotFoundException("Paste not found or has expired.");
            }
        }

        // If UNLISTED, enforce tokenized sharing rules unless authenticated owner
        if (paste.getVisibility() == Visibility.UNLISTED && !isOwner) {
            ShareAccessState state = paste.getShareAccessState();
            if (state == ShareAccessState.REVOKED) {
                throw new ResourceNotFoundException("Paste not found or has expired.");
            }
            if (state == ShareAccessState.ACTIVE) {
                if (shareToken == null || !ShareTokenUtil.verifyToken(shareToken, paste.getShareTokenHash())) {
                    throw new ResourceNotFoundException("Paste not found or has expired.");
                }
            }
            // If LEGACY_OPEN, access is permitted without a token for backward compatibility
        }

        return paste;
    }

    private void consumeBurnAfterReadingAtomically(Paste paste) {
        // Atomic consume: update expires_at = now so only the first concurrent request claims the view-once paste
        int updated = pasteRepository.consumeBurnAfterReading(paste.getId(), Instant.now());
        if (updated == 0) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }
        pasteRepository.delete(paste);
    }

    private PasteFile findFileOrThrow(Paste paste, String filename) {
        if (paste.getFiles() != null) {
            for (PasteFile file : paste.getFiles()) {
                if (file.getFilename().equalsIgnoreCase(filename.trim())) {
                    return file;
                }
            }
        }
        if (!paste.isEncrypted()) {
            // Fallback for pastes with single content matching synthesized filename
            String synthesized = deriveFilename(paste.getTitle(), paste.getLanguage(), paste.getPublicId());
            if (synthesized.equalsIgnoreCase(filename.trim())) {
                return new PasteFile(paste, synthesized, paste.getContent(), paste.getLanguage(), 0);
            }
        }
        throw new ResourceNotFoundException("File '" + filename + "' not found in paste.");
    }

    private PasteFile findFileByIdOrThrow(Paste paste, Long fileId) {
        if (fileId != null && paste.getFiles() != null) {
            for (PasteFile file : paste.getFiles()) {
                if (file.getId() != null && file.getId().equals(fileId)) {
                    return file;
                }
            }
        }
        throw new ResourceNotFoundException("File ID " + fileId + " not found in paste.");
    }

    private List<PasteFileResponse> resolveFileResponses(Paste paste) {
        if (paste.getFiles() != null && !paste.getFiles().isEmpty()) {
            if (paste.isEncrypted()) {
                return paste.getFiles().stream()
                        .map(f -> new PasteFileResponse(
                                f.getId(),
                                f.getFilename(),
                                null,
                                f.getLanguage(),
                                f.getCiphertext() != null ? f.getCiphertext().length : 0,
                                0,
                                f.getSortOrder(),
                                f.getCiphertext(),
                                f.getNonce(),
                                f.getAuthTag()
                        ))
                        .toList();
            }

            return paste.getFiles().stream()
                    .map(f -> new PasteFileResponse(
                            f.getId(),
                            f.getFilename(),
                            f.getContent(),
                            f.getLanguage(),
                            f.getContent() != null ? f.getContent().getBytes(StandardCharsets.UTF_8).length : 0,
                            countLines(f.getContent()),
                            f.getSortOrder()
                    ))
                    .toList();
        }

        // Fallback for existing legacy single-content paste
        String synthesized = deriveFilename(paste.getTitle(), paste.getLanguage(), paste.getPublicId());
        return List.of(new PasteFileResponse(
                null,
                synthesized,
                paste.getContent(),
                paste.getLanguage(),
                paste.getContent() != null ? paste.getContent().getBytes(StandardCharsets.UTF_8).length : 0,
                countLines(paste.getContent()),
                0
        ));
    }

    private String generateUniquePublicId() {
        for (int i = 0; i < 5; i++) {
            String candidate = nanoIdGenerator.generate();
            if (!pasteRepository.existsByPublicId(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("Failed to generate a unique public identifier after multiple attempts.");
    }

    private void validateCustomSlug(String slug) {
        if (slug.length() < 3 || slug.length() > 50) {
            throw new BadRequestException("Custom link must be between 3 and 50 characters.");
        }
        if (!slug.matches("^[a-zA-Z0-9_-]+$")) {
            throw new BadRequestException("Custom link may only contain letters, numbers, hyphens, and underscores.");
        }
        if (RESERVED_SLUGS.contains(slug.toLowerCase(Locale.ROOT))) {
            throw new BadRequestException("The custom link '" + slug + "' is reserved. Please choose a different link name.");
        }
    }

    private static final java.util.regex.Pattern RESERVED_DEVICE_NAMES =
            java.util.regex.Pattern.compile("^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\\..*)?$", java.util.regex.Pattern.CASE_INSENSITIVE);

    public static void validateFilenameSecurity(String filename) {
        if (filename == null || filename.isBlank()) {
            throw new BadRequestException("Filename cannot be blank.");
        }
        String normalized = java.text.Normalizer.normalize(filename, java.text.Normalizer.Form.NFC).trim();
        if (normalized.contains("..") || normalized.contains("/") || normalized.contains("\\") || normalized.contains("\"")) {
            throw new BadRequestException("Filename cannot contain directory traversal or quote characters ('..', '/', '\\', '\"').");
        }
        if (RESERVED_DEVICE_NAMES.matcher(normalized).matches()) {
            throw new BadRequestException("Filename '" + normalized + "' is a reserved device name.");
        }
        for (char c : normalized.toCharArray()) {
            if (c < 32 || c == 127) {
                throw new BadRequestException("Filename contains invalid control characters.");
            }
        }
        if (normalized.length() > 255) {
            throw new BadRequestException("Filename exceeds 255 characters limit.");
        }
    }

    public static void validateTextContent(String filename, String content) {
        if (content == null) {
            return;
        }
        if (content.indexOf('\0') >= 0) {
            throw new BadRequestException("File '" + filename + "' contains binary (NUL byte) content which is not supported.");
        }
    }

    public static String resolveLanguage(String explicitLanguage, String filename) {
        if (explicitLanguage != null && !explicitLanguage.isBlank() && !"plaintext".equalsIgnoreCase(explicitLanguage.trim())) {
            return explicitLanguage.toLowerCase(Locale.ROOT).trim();
        }
        if (filename == null || filename.isBlank()) {
            return "plaintext";
        }
        int dotIdx = filename.lastIndexOf('.');
        if (dotIdx < 0 || dotIdx == filename.length() - 1) {
            return "plaintext";
        }
        String ext = filename.substring(dotIdx + 1).toLowerCase(Locale.ROOT).trim();
        return switch (ext) {
            case "java" -> "java";
            case "js", "mjs", "cjs" -> "javascript";
            case "ts", "tsx" -> "typescript";
            case "py" -> "python";
            case "html", "htm" -> "html";
            case "css" -> "css";
            case "json" -> "json";
            case "sql" -> "sql";
            case "md", "markdown" -> "markdown";
            case "rs" -> "rust";
            case "go" -> "go";
            case "c", "h" -> "c";
            case "cpp", "hpp", "cc", "cxx" -> "cpp";
            case "cs" -> "csharp";
            case "php" -> "php";
            case "rb" -> "ruby";
            case "yml", "yaml" -> "yaml";
            case "xml" -> "xml";
            case "sh", "bash", "zsh" -> "bash";
            case "kt", "kts" -> "kotlin";
            default -> "plaintext";
        };
    }

    public static String deriveFilename(String title, String language, String fallbackPublicId) {
        String base = (title != null && !title.isBlank())
                ? title.replaceAll("[^a-zA-Z0-9._-]", "_").replaceAll("_+", "_")
                : "paste-" + fallbackPublicId;
        if (base.contains(".")) {
            return base;
        }
        String ext = resolveExtension(language);
        return base + "." + ext;
    }

    private static String sanitizeFilenameForZip(String filename) {
        if (filename == null || filename.isBlank()) return "untitled.txt";
        String clean = filename.replace("/", "_").replace("\\", "_").replace("..", "_");
        return clean.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    private static String sanitizeFilename(String title, String fallbackId) {
        if (title == null || title.isBlank()) {
            return "paste-" + fallbackId;
        }
        String sanitized = title.replaceAll("[^a-zA-Z0-9_-]", "_").replaceAll("_+", "_");
        if (sanitized.isBlank()) {
            return "paste-" + fallbackId;
        }
        return sanitized.length() > 50 ? sanitized.substring(0, 50) : sanitized;
    }

    public static String resolveExtension(String language) {
        if (language == null) return "txt";
        return switch (language.toLowerCase(Locale.ROOT)) {
            case "java" -> "java";
            case "javascript", "js" -> "js";
            case "typescript", "ts" -> "ts";
            case "python", "py" -> "py";
            case "json" -> "json";
            case "xml" -> "xml";
            case "html" -> "html";
            case "css" -> "css";
            case "sql" -> "sql";
            case "bash", "sh" -> "sh";
            case "yaml", "yml" -> "yaml";
            case "markdown", "md" -> "md";
            case "go" -> "go";
            case "rust", "rs" -> "rs";
            case "c" -> "c";
            case "cpp" -> "cpp";
            case "csharp", "cs" -> "cs";
            case "php" -> "php";
            case "kotlin", "kt" -> "kt";
            default -> "txt";
        };
    }

    private int countLines(String text) {
        if (text == null || text.isEmpty()) return 0;
        int lines = 1;
        for (int i = 0; i < text.length(); i++) {
            if (text.charAt(i) == '\n') {
                lines++;
            }
        }
        return lines;
    }

    public record DownloadData(String filename, String content, byte[] rawBytes, EncryptionMode encryptionMode) {
        public DownloadData(String filename, String content) {
            this(filename, content, content != null ? content.getBytes(StandardCharsets.UTF_8) : new byte[0], null);
        }
        public DownloadData(String filename, byte[] rawBytes, EncryptionMode encryptionMode) {
            this(filename, null, rawBytes, encryptionMode);
        }
        public byte[] getPayloadBytes() {
            if (rawBytes != null) return rawBytes;
            if (content != null) return content.getBytes(StandardCharsets.UTF_8);
            return new byte[0];
        }
    }
    public record ZipDownloadData(String filename, byte[] zipBytes) {}
}
