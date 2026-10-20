package com.pastebin.paste.infrastructure;

import com.pastebin.paste.domain.Tag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TagRepository extends JpaRepository<Tag, Long> {

    Optional<Tag> findByUserIdAndName(@Param("userId") Long userId, @Param("name") String name);

    @Query("SELECT t FROM Tag t WHERE t.userId = :userId ORDER BY t.name ASC")
    List<Tag> findAllByUserIdOrderByName(@Param("userId") Long userId);
}
